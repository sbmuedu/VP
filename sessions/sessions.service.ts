import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { LLMService } from "../llm/llm.service";
import {
  StartSessionDto,
  FastForwardDto,
  PatientQuestionDto,
  PerformActionDto,
} from "./dto";
import {
  UserRole,
  ScenarioSession,
  SessionStatus,
  TimeFlowMode,
  ActionStatus,
  PatientState,
  VitalSigns,
  EmotionalState,
  TimeEvent,
} from "sharedtypes/dist";

/**
 * Sessions Service
 * Handles scenario session management, time control, patient interactions, and medical actions
 */
@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService, private llmService: LLMService) {}

  /**
   * Starts a new scenario session for a student
   * @param scenarioId - ID of the scenario to start
   * @param studentId - ID of the student starting the session
   * @param startSessionDto - Session configuration
   * @returns Newly created session with initial patient state
   */
  async startSession(
    scenarioId: string,
    studentId: string,
    startSessionDto: StartSessionDto
  ): Promise<{ session: ScenarioSession; patientState: PatientState }> {
    // Verify scenario exists and is accessible
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: {
        id: scenarioId,
        isActive: true,
      },
    });

    if (!scenario) {
      throw new NotFoundException(
        `Scenario with ID ${scenarioId} not found or inactive`
      );
    }

    // Check if student already has an active session for this scenario
    const existingActiveSession = await this.prisma.scenarioSession.findFirst({
      where: {
        scenarioId,
        studentId,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
    });

    if (existingActiveSession) {
      throw new ConflictException(
        "Student already has an active session for this scenario"
      );
    }

    // Verify supervisor if provided
    if (startSessionDto.supervisorId) {
      const supervisor = await this.prisma.user.findUnique({
        where: {
          id: startSessionDto.supervisorId,
          role: {
            in: [UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN],
          },
        },
      });

      if (!supervisor) {
        throw new BadRequestException(
          "Invalid supervisor ID or insufficient permissions"
        );
      }
    }

    // Create initial patient state from scenario
    const initialPatientState = this.createInitialPatientState(scenario);

    // Create new session
    const session = await this.prisma.scenarioSession.create({
      data: {
        scenarioId,
        studentId,
        supervisorId: startSessionDto.supervisorId,
        assessmentType: startSessionDto.assessmentType,
        status: SessionStatus.ACTIVE,
        startTime: new Date(),
        currentVirtualTime: new Date(), // Start at current real time
        lastRealTimeUpdate: new Date(),
        timeFlowMode: TimeFlowMode.REAL_TIME,
        totalRealTimeElapsed: 0,
        totalVirtualTimeElapsed: 0,
        timePressureEnabled: scenario.requiresTimePressure,
        currentPatientState: initialPatientState,
        currentEmotionalState: scenario.initialEmotionalState,
        latestVitalSigns: scenario.initialVitalSigns,
        completedSteps: [],
        activeMedications: [],
        complicationsEncountered: [],
        competencyScores: this.createInitialCompetencyScores(),
      },
      include: {
        scenario: {
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                specialization: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Schedule initial events from scenario
    await this.scheduleInitialEvents(session.id, scenario);

    return {
      session: session as ScenarioSession,
      patientState: initialPatientState,
    };
  }

  /**
   * Retrieves a session by ID with proper access control
   * @param sessionId - Session ID
   * @param userId - Current user ID
   * @param userRole - Current user role
   * @returns Session details
   */
  async getSession(
    sessionId: string,
    userId: string,
    userRole: UserRole
  ): Promise<ScenarioSession> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: {
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                specialization: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        medicationOrders: {
          include: {
            drug: true,
            administeredBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        procedureOrders: {
          include: {
            procedure: true,
            performedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        labOrders: {
          include: {
            test: true,
            collectedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        conversations: {
          orderBy: { timestamp: "asc" },
          take: 50, // Limit conversation history
        },
        timeEvents: {
          where: {
            virtualTimeScheduled: {
              lte: new Date(), // Only show past and current events
            },
          },
          orderBy: { virtualTimeScheduled: "asc" },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Check access permissions
    this.checkSessionAccess(session, userId, userRole);

    return session as ScenarioSession;
  }

  /**
   * Fast-forwards time in a session
   * @param sessionId - Session ID
   * @param fastForwardDto - Fast-forward parameters
   * @param userId - Current user ID
   * @returns Updated session state and any triggered events
   */
  async fastForwardTime(
    sessionId: string,
    fastForwardDto: FastForwardDto,
    userId: string
  ): Promise<{
    session: ScenarioSession;
    triggeredEvents: TimeEvent[];
    interrupted: boolean;
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Verify user has access to this session
    if (session.studentId !== userId && session.supervisorId !== userId) {
      throw new ForbiddenException("Access denied to this session");
    }

    // Check if session is active
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException("Cannot fast-forward inactive session");
    }

    // Check if there are blocking actions
    const blockingActions = await this.prisma.medicalAction.count({
      where: {
        sessionId,
        status: ActionStatus.IN_PROGRESS,
        canBeFastForwarded: false,
      },
    });

    if (blockingActions > 0) {
      throw new BadRequestException(
        "Cannot fast-forward while actions are in progress"
      );
    }

    const currentVirtualTime = new Date(session.currentVirtualTime);
    const newVirtualTime = new Date(
      currentVirtualTime.getTime() + fastForwardDto.virtualMinutes * 60000
    );

    // Check for events that would interrupt fast-forward
    const interruptingEvents = await this.getInterruptingEvents(
      sessionId,
      currentVirtualTime,
      newVirtualTime,
      fastForwardDto.stopOnEvents ?? true //reza
    );

    let finalVirtualTime = newVirtualTime;
    let interrupted = false;

    if (interruptingEvents.length > 0 && fastForwardDto.stopOnEvents) {
      // Stop at first interrupting event
      if (interruptingEvents && interruptingEvents[0])
        //reza
        finalVirtualTime = new Date(
          interruptingEvents[0]!.virtualTimeScheduled
        );
      interrupted = true;
    }

    // Calculate real time elapsed during fast-forward
    const realTimeElapsed = this.calculateRealTimeElapsed(
      session.timeAccelerationRate,
      fastForwardDto.virtualMinutes
    );

    // Update session time
    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentVirtualTime: finalVirtualTime,
        lastRealTimeUpdate: new Date(),
        timeFlowMode: interrupted
          ? TimeFlowMode.PAUSED
          : TimeFlowMode.ACCELERATED,
        totalVirtualTimeElapsed:
          session.totalVirtualTimeElapsed + fastForwardDto.virtualMinutes,
        totalRealTimeElapsed: session.totalRealTimeElapsed + realTimeElapsed,
      },
      include: {
        scenario: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Process events that occurred during fast-forward
    const triggeredEvents = await this.processTimeEvents(
      sessionId,
      currentVirtualTime,
      finalVirtualTime
    );

    // Update patient state based on elapsed time and events
    await this.updatePatientStateFromTime(
      sessionId,
      fastForwardDto.virtualMinutes
    );

    return {
      session: updatedSession as ScenarioSession,
      triggeredEvents,
      interrupted,
    };
  }

  /**
   * Asks a question to the virtual patient
   * @param sessionId - Session ID
   * @param patientQuestionDto - Question and context
   * @param userId - User asking the question
   * @returns Patient response and updated state
   */
  async askPatientQuestion(
    sessionId: string,
    patientQuestionDto: PatientQuestionDto,
    userId: string
  ): Promise<{
    response: string;
    emotionalState: EmotionalState;
    vitalSignChanges?: Partial<VitalSigns>;
    conversationId: string;
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Verify user has access to this session
    if (session.studentId !== userId && session.supervisorId !== userId) {
      throw new ForbiddenException("Access denied to this session");
    }

    // Get conversation context
    const conversationContext = await this.buildConversationContext(sessionId);

    // Generate patient response using LLM
    const llmResponse = await this.llmService.generatePatientResponse(
      patientQuestionDto.question,
      conversationContext
    );

    // Save conversation to database
    const conversation = await this.prisma.lLMConversation.create({
      data: {
        sessionId,
        userId,
        userMessage: patientQuestionDto.question,
        patientResponse: llmResponse.processedResponse, //reza llmResponse.responce
        messageContext: conversationContext,
        emotionalContext: llmResponse.emotionalState,
        virtualTimestamp: session.currentVirtualTime,
        medicalAccuracy: llmResponse.medicalAccuracy,
        appropriateness: llmResponse.educationalValue,
      },
    });

    // Update session emotional state if changed
    if (llmResponse.emotionalState !== session.currentEmotionalState) {
      await this.prisma.scenarioSession.update({
        where: { id: sessionId },
        data: { currentEmotionalState: llmResponse.emotionalState },
      });
    }

    // Update vital signs if changed
    if (llmResponse.vitalSignChanges) {
      await this.updateVitalSigns(sessionId, llmResponse.vitalSignChanges);
    }

    // Process any triggered events from the conversation
    if (llmResponse.triggeredEvents && llmResponse.triggeredEvents.length > 0) {
      await this.processTriggeredEvents(sessionId, llmResponse.triggeredEvents);
    }

    return {
      response: llmResponse.processedResponse, //llmResponse.response.   reza
      emotionalState: llmResponse.emotionalState,
      vitalSignChanges: llmResponse.vitalSignChanges,
      conversationId: conversation.id,
    };
  }

  /**
   * Performs a medical action in the session
   * @param sessionId - Session ID
   * @param performActionDto - Action details
   * @param userId - User performing the action
   * @returns Action result and updated patient state
   */
  async performAction(
    sessionId: string,
    performActionDto: PerformActionDto,
    userId: string
  ): Promise<{
    action: any;
    success: boolean;
    result: any;
    patientState: PatientState;
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Verify user has access to this session
    if (session.studentId !== userId && session.supervisorId !== userId) {
      throw new ForbiddenException("Access denied to this session");
    }

    // Create medical action record
    const action = await this.prisma.medicalAction.create({
      data: {
        sessionId,
        userId,
        actionType: performActionDto.actionType,
        actionDetails: performActionDto.actionDetails,
        priority: performActionDto.priority,
        status: ActionStatus.IN_PROGRESS,
        realTimeStarted: new Date(),
        virtualTimeStarted: session.currentVirtualTime,
        canBeFastForwarded: this.canActionBeFastForwarded(
          performActionDto.actionType
        ),
      },
    });

    // Process the action based on type
    const actionResult = await this.processMedicalAction(
      sessionId,
      performActionDto,
      session.currentPatientState as PatientState
    );

    // Update action with result
    const updatedAction = await this.prisma.medicalAction.update({
      where: { id: action.id },
      data: {
        status: ActionStatus.COMPLETED,
        realTimeCompleted: new Date(),
        virtualTimeCompleted: session.currentVirtualTime,
        result: actionResult.result,
        success: actionResult.success,
        feedback: actionResult.feedback,
      },
    });

    // Update patient state
    const updatedPatientState = await this.updatePatientStateFromAction(
      sessionId,
      performActionDto,
      actionResult
    );

    return {
      action: updatedAction,
      success: actionResult.success,
      result: actionResult.result,
      patientState: updatedPatientState,
    };
  }

  /**
   * Pauses an active session
   * @param sessionId - Session ID
   * @param userId - User pausing the session
   * @returns Updated session
   */
  async pauseSession(
    sessionId: string,
    userId: string
  ): Promise<ScenarioSession> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    if (session.studentId !== userId) {
      throw new ForbiddenException("Only the student can pause their session");
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException("Session is not active");
    }

    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.PAUSED,
        timeFlowMode: TimeFlowMode.PAUSED,
      },
      include: {
        scenario: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedSession as ScenarioSession;
  }

  /**
   * Resumes a paused session
   * @param sessionId - Session ID
   * @param userId - User resuming the session
   * @returns Updated session
   */
  async resumeSession(
    sessionId: string,
    userId: string
  ): Promise<ScenarioSession> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    if (session.studentId !== userId) {
      throw new ForbiddenException("Only the student can resume their session");
    }

    if (session.status !== SessionStatus.PAUSED) {
      throw new BadRequestException("Session is not paused");
    }

    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ACTIVE,
        timeFlowMode: TimeFlowMode.REAL_TIME,
        lastRealTimeUpdate: new Date(),
      },
      include: {
        scenario: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedSession as ScenarioSession;
  }

  /**
   * Completes a session and calculates final assessment
   * @param sessionId - Session ID
   * @param userId - User completing the session
   * @returns Completed session with final assessment
   */
  async completeSession(
    sessionId: string,
    userId: string
  ): Promise<ScenarioSession> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    if (session.studentId !== userId) {
      throw new ForbiddenException(
        "Only the student can complete their session"
      );
    }

    // Calculate final assessment scores
    const assessment = await this.calculateFinalAssessment(sessionId);

    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.COMPLETED,
        timeFlowMode: TimeFlowMode.PAUSED,
        endTime: new Date(),
        competencyScores: assessment.competencyScores,
        overallScore: assessment.overallScore,
        timeEfficiencyScore: assessment.timeEfficiencyScore,
        finalFeedback: assessment.feedback,
      },
      include: {
        scenario: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedSession as ScenarioSession;
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Creates initial patient state from scenario configuration
   */
  private createInitialPatientState(scenario: any): PatientState {
    return {
      vitalSigns: scenario.initialVitalSigns,
      symptoms: this.extractInitialSymptoms(scenario.historyOfPresentIllness),
      mentalStatus: "Alert and oriented",
      physicalFindings: [],
      labResults: [],
      treatmentResponse: [],
    };
  }

  /**
   * Creates initial competency scores structure
   */
  private createInitialCompetencyScores() {
    return {
      diagnostic: { score: 0, feedback: "", evidence: [] },
      procedural: { score: 0, feedback: "", evidence: [] },
      communication: { score: 0, feedback: "", evidence: [] },
      professionalism: { score: 0, feedback: "", evidence: [] },
      criticalThinking: { score: 0, feedback: "", evidence: [] },
    };
  }

  /**
   * Schedules initial events from scenario configuration
   */
  private async scheduleInitialEvents(sessionId: string, scenario: any) {
    if (!scenario.scheduledEvents) return;

    for (const event of scenario.scheduledEvents) {
      // Parse virtual time and convert to actual datetime
      const [hours, minutes] = event.virtualTime.split(":").map(Number);
      const virtualTime = new Date();
      virtualTime.setHours(hours, minutes, 0, 0);

      await this.prisma.timeEvent.create({
        data: {
          sessionId,
          eventType: event.eventType,
          eventData: event.details,
          virtualTimeScheduled: virtualTime,
          requiresAttention: event.requiresAttention || false,
          isComplication: event.eventType.includes("complication"),
        },
      });
    }
  }

  /**
   * Checks if user has access to a session
   */
  private checkSessionAccess(
    session: any,
    userId: string,
    userRole: UserRole
  ): void {
    // Admin can access everything
    if (userRole === UserRole.ADMIN) return;

    // Student can access their own sessions
    if (session.studentId === userId) return;

    // Supervisor can access sessions they supervise
    if (session.supervisorId === userId) return;

    // Medical experts can access sessions from their institution
    if (userRole === UserRole.MEDICAL_EXPERT) {
      // Additional institution checks would go here
      return;
    }

    throw new ForbiddenException("Access denied to this session");
  }

  /**
   * Gets events that would interrupt fast-forward
   */
  private async getInterruptingEvents(
    sessionId: string,
    fromTime: Date,
    toTime: Date,
    stopOnEvents: boolean
  ): Promise<TimeEvent[]> {
    if (!stopOnEvents) return [];

    return this.prisma.timeEvent.findMany({
      where: {
        sessionId,
        virtualTimeScheduled: {
          gt: fromTime,
          lte: toTime,
        },
        requiresAttention: true,
        acknowledgedAt: null,
      },
      orderBy: { virtualTimeScheduled: "asc" },
    }) as Promise<TimeEvent[]>;
  }

  /**
   * Calculates real time elapsed based on acceleration rate
   */
  private calculateRealTimeElapsed(
    accelerationRate: number,
    virtualMinutes: number
  ): number {
    return (virtualMinutes / accelerationRate) * 60; // Convert to seconds
  }

  /**
   * Processes time events that occurred during a time period
   */
  private async processTimeEvents(
    sessionId: string,
    fromTime: Date,
    toTime: Date
  ): Promise<TimeEvent[]> {
    const events = await this.prisma.timeEvent.findMany({
      where: {
        sessionId,
        virtualTimeScheduled: {
          gte: fromTime,
          lte: toTime,
        },
        virtualTimeTriggered: null,
      },
    });

    const triggeredEvents: TimeEvent[] = [];

    for (const event of events) {
      const triggeredEvent = await this.prisma.timeEvent.update({
        where: { id: event.id },
        data: {
          virtualTimeTriggered: new Date(),
          realTimeTriggered: new Date(),
        },
      });

      triggeredEvents.push(triggeredEvent as TimeEvent);

      // Process event consequences
      await this.processEventConsequences(sessionId, event);
    }

    return triggeredEvents;
  }

  /**
   * Builds conversation context for LLM
   */
  private async buildConversationContext(sessionId: string): Promise<any> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: true,
        conversations: {
          orderBy: { timestamp: "desc" },
          take: 10, // Last 10 messages for context
        },
      },
    });

    if (!session) throw new NotFoundException("Session not found");

    return {
      patientState: session.currentPatientState,
      medicalHistory: session.scenario.pastMedicalHistory,
      currentSymptoms: (session.currentPatientState as any).symptoms || [],
      vitalSigns: session.latestVitalSigns,
      emotionalState: session.currentEmotionalState,
      painLevel: (session.latestVitalSigns as any).painLevel || 0,
      conversationHistory: session.conversations.map(
        (conv: { userMessage: any; timestamp: any }) => ({
          role: "user",
          content: conv.userMessage,
          timestamp: conv.timestamp,
        })
      ),
      educationalObjectives: session.scenario.learningObjectives,
    };
  }

  /**
   * Processes medical actions and returns results
   */
  private async processMedicalAction(
    sessionId: string,
    action: PerformActionDto,
    patientState: PatientState
  ): Promise<{ success: boolean; result: any; feedback?: string }> {
    // This would contain complex medical logic for different action types
    // For now, return a simplified implementation

    switch (action.actionType) {
      case "examination":
        return this.processExaminationAction(action, patientState);
      case "medication":
        return this.processMedicationAction(action, patientState);
      case "procedure":
        return this.processProcedureAction(action, patientState);
      case "diagnostic":
        return this.processDiagnosticAction(action, patientState);
      default:
        return {
          success: false,
          result: null,
          feedback: "Unknown action type",
        };
    }
  }

  /**
   * Processes examination actions
   */
  private processExaminationAction(
    action: PerformActionDto,
    patientState: PatientState
  ): { success: boolean; result: any; feedback?: string } {
    // Simplified examination logic
    const examinationType = action.actionDetails.procedure;

    // Mock examination results based on patient state
    const result = {
      findings: `Normal ${examinationType} examination`,
      abnormalities: [],
      notes: "Examination performed correctly",
    };

    return {
      success: true,
      result,
      feedback: "Examination completed successfully",
    };
  }

  /**
   * Processes medication actions
   */
  private processMedicationAction(
    action: PerformActionDto,
    patientState: PatientState
  ): { success: boolean; result: any; feedback?: string } {
    // Simplified medication logic
    const medication = action.actionDetails.medication;

    const result = {
      medication,
      dosage: action.actionDetails.dosage,
      administrationTime: new Date(),
      expectedEffects: "Pain relief in 15-30 minutes",
    };

    return {
      success: true,
      result,
      feedback: "Medication administered correctly",
    };
  }

  /**
   * Checks if an action type can be fast-forwarded
   */
  private canActionBeFastForwarded(actionType: string): boolean {
    const nonFastForwardableActions = [
      "complex_procedure",
      "surgery",
      "critical_care",
    ];

    return !nonFastForwardableActions.includes(actionType);
  }

  /**
   * Extracts initial symptoms from history of present illness
   */
  private extractInitialSymptoms(history: string): string[] {
    // Simplified symptom extraction - in real implementation, this would be more sophisticated
    const commonSymptoms = [
      "pain",
      "fever",
      "cough",
      "shortness of breath",
      "nausea",
      "vomiting",
      "headache",
      "dizziness",
      "fatigue",
      "weakness",
    ];

    return commonSymptoms.filter((symptom) =>
      history.toLowerCase().includes(symptom)
    );
  }

  /**
   * Updates patient state based on elapsed time
   */
  private async updatePatientStateFromTime(
    sessionId: string,
    virtualMinutes: number
  ): Promise<void> {
    // This would contain complex physiological modeling
    // For now, it's a placeholder implementation
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return;

    // Update vital signs based on disease progression
    const updatedVitalSigns = this.simulateVitalSignChanges(
      session.latestVitalSigns as VitalSigns,
      virtualMinutes,
      session.scenarioId // Use scenario for progression model
    );

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        latestVitalSigns: updatedVitalSigns,
        currentPatientState: {
          ...session.currentPatientState,
          vitalSigns: updatedVitalSigns,
        },
      },
    });
  }

  /**
   * Simulates vital sign changes over time
   */
  private simulateVitalSignChanges(
    currentVitalSigns: VitalSigns,
    minutesElapsed: number,
    scenarioId: string
  ): VitalSigns {
    // Simplified simulation - in real implementation, this would use the physiology model
    return {
      ...currentVitalSigns,
      heartRate: Math.max(
        60,
        currentVitalSigns.heartRate + minutesElapsed * 0.1
      ),
      // More complex simulations would go here
    };
  }

  /**
   * Updates patient state based on action results
   */
  private async updatePatientStateFromAction(
    sessionId: string,
    action: PerformActionDto,
    actionResult: any
  ): Promise<PatientState> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    const currentState = session.currentPatientState as PatientState;

    // Update state based on action type and result
    // This would contain complex medical logic

    const updatedState = {
      ...currentState,
      // Update based on action
    };

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: { currentPatientState: updatedState },
    });

    return updatedState;
  }

  /**
   * Updates vital signs in the session
   */
  private async updateVitalSigns(
    sessionId: string,
    changes: Partial<VitalSigns>
  ): Promise<void> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return;

    const currentVitalSigns = session.latestVitalSigns as VitalSigns;
    const updatedVitalSigns = { ...currentVitalSigns, ...changes };

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        latestVitalSigns: updatedVitalSigns,
        currentPatientState: {
          ...session.currentPatientState,
          vitalSigns: updatedVitalSigns,
        },
      },
    });
  }

  /**
   * Processes events triggered by conversations
   */
  private async processTriggeredEvents(
    sessionId: string,
    eventTypes: string[]
  ): Promise<void> {
    for (const eventType of eventTypes) {
      await this.prisma.timeEvent.create({
        data: {
          sessionId,
          eventType,
          eventData: { triggeredBy: "conversation" },
          virtualTimeScheduled: new Date(),
          requiresAttention: true,
          isComplication: eventType.includes("complication"),
        },
      });
    }
  }

  /**
   * Processes event consequences
   */
  private async processEventConsequences(
    sessionId: string,
    event: any
  ): Promise<void> {
    // Handle different event types and their consequences
    switch (event.eventType) {
      case "lab_result_ready":
        await this.processLabResult(sessionId, event);
        break;
      case "medication_effect":
        await this.processMedicationEffect(sessionId, event);
        break;
      case "patient_deterioration":
        await this.processPatientDeterioration(sessionId, event);
        break;
      default:
        // Handle other event types
        break;
    }
  }

  /**
   * Processes lab result events
   */
  private async processLabResult(sessionId: string, event: any): Promise<void> {
    // Update patient state with lab results
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return;

    const currentState = session.currentPatientState as PatientState;
    const updatedLabResults = [
      ...currentState.labResults,
      {
        test: event.eventData.test,
        value: event.eventData.value,
        units: event.eventData.units,
        normalRange: event.eventData.normalRange,
        isCritical: event.eventData.isCritical,
        timestamp: new Date(),
      },
    ];

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentPatientState: {
          ...currentState,
          labResults: updatedLabResults,
        },
      },
    });
  }

  /**
   * Processes medication effect events
   */
  private async processMedicationEffect(
    sessionId: string,
    event: any
  ): Promise<void> {
    // Update vital signs based on medication effects
    const changes = event.eventData.vitalSignChanges;
    if (changes) {
      await this.updateVitalSigns(sessionId, changes);
    }
  }

  /**
   * Processes patient deterioration events
   */
  private async processPatientDeterioration(
    sessionId: string,
    event: any
  ): Promise<void> {
    // Update patient state for deterioration
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return;

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        complicationsEncountered: [
          ...session.complicationsEncountered,
          event.eventData.complication,
        ],
      },
    });

    // Update vital signs for deterioration
    const deteriorationChanges = event.eventData.vitalSignChanges;
    if (deteriorationChanges) {
      await this.updateVitalSigns(sessionId, deteriorationChanges);
    }
  }

  /**
   * Processes procedure actions
   */
  private processProcedureAction(
    action: PerformActionDto,
    patientState: PatientState
  ): { success: boolean; result: any; feedback?: string } {
    const procedure = action.actionDetails.procedure;

    const result = {
      procedure,
      findings: "Procedure completed successfully",
      complications: [],
      duration: "15 minutes",
    };

    return {
      success: true,
      result,
      feedback: "Procedure performed correctly",
    };
  }

  /**
   * Processes diagnostic actions
   */
  private processDiagnosticAction(
    action: PerformActionDto,
    patientState: PatientState
  ): { success: boolean; result: any; feedback?: string } {
    const test = action.actionDetails.test;

    const result = {
      test,
      result: "Within normal limits",
      interpretation: "No significant abnormalities detected",
      recommendations: "Continue with current management",
    };

    return {
      success: true,
      result,
      feedback: "Diagnostic test ordered successfully",
    };
  }

  /**
   * Calculates final assessment for completed session
   */
  private async calculateFinalAssessment(sessionId: string): Promise<{
    competencyScores: any;
    overallScore: number;
    timeEfficiencyScore: number;
    feedback: string;
  }> {
    // This would contain complex assessment logic
    // For now, return mock assessment

    return {
      competencyScores: {
        diagnostic: {
          score: 0.85,
          feedback: "Good diagnostic reasoning",
          evidence: [],
        },
        procedural: {
          score: 0.78,
          feedback: "Adequate procedural skills",
          evidence: [],
        },
        communication: {
          score: 0.92,
          feedback: "Excellent patient communication",
          evidence: [],
        },
        professionalism: {
          score: 0.88,
          feedback: "Professional conduct maintained",
          evidence: [],
        },
        criticalThinking: {
          score: 0.81,
          feedback: "Good problem-solving approach",
          evidence: [],
        },
      },
      overallScore: 0.85,
      timeEfficiencyScore: 0.79,
      feedback:
        "Good overall performance with room for improvement in procedural efficiency.",
    };
  }

  private calculateDuration(startTime: Date, endTime: Date): number {
    return (endTime.getTime() - startTime.getTime()) / 1000; // in seconds
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  async getUserSessionAnalytics(userId: string) {
  const sessions = await this.prisma.scenarioSession.findMany({
    where: {
      studentId: userId,
      status: 'COMPLETED',
      endTime: { not: null },
    },
    include: {
      scenario: {
        select: {
          title: true,
          difficultyLevel: true,
          expectedDuration: true,
          medicalCondition: true,
        },
      },
    },
  });

  // Calculate additional metrics
  const totalDuration = sessions.reduce((total:any, session:any) => 
    total + this.calculateDuration(session.startTime, session.endTime!), 0
  );

  const averageScore = sessions.reduce((total:any, session:any) => 
    total + (session.overallScore || 0), 0
  ) / sessions.length;

  const averageEfficiency = sessions.reduce((total:any, session:any) => {
    const expected = session.scenario.expectedDuration || 3600;
    const actual = this.calculateDuration(session.startTime, session.endTime!);
    return total + (expected / Math.max(actual, 1));
  }, 0) / sessions.length;

  return {
    summary: {
      totalSessions: sessions.length,
      totalTimeSpent: totalDuration,
      formattedTimeSpent: this.formatDuration(totalDuration),
      averageSessionDuration: totalDuration / sessions.length,
      averageScore: averageScore || 0,
      averageEfficiency: averageEfficiency || 0,
    },
    byDifficulty: this.groupSessionsByDifficulty(sessions),
    completionTrend: this.analyzeCompletionTrend(sessions),
    recentActivity: {
      lastSession: sessions.length > 0 ? sessions[sessions.length - 1] : null,
      sessionsThisMonth: sessions.filter((s:any) => 
        this.isThisMonth(s.endTime!)
      ).length,
      favoriteScenario: this.findMostFrequentScenario(sessions),
    }
  };
}

private isThisMonth(date: Date): boolean {
  const now = new Date();
  const target = new Date(date);
  return now.getMonth() === target.getMonth() && 
         now.getFullYear() === target.getFullYear();
}

private findMostFrequentScenario(sessions: any[]): string | null {
  if (sessions.length === 0) return null;
  
  const scenarioCount = sessions.reduce((acc, session) => {
    const scenarioName = session.scenario.title;
    acc[scenarioName] = (acc[scenarioName] || 0) + 1;
    return acc;
  }, {} as any);

  return Object.keys(scenarioCount).reduce((a, b) => 
    scenarioCount[a] > scenarioCount[b] ? a : b
  );
}

private groupSessionsByDifficulty(sessions: any[]): any {
  const groups = sessions.reduce((acc, session) => {
    const difficulty = session.scenario.difficultyLevel || 'unknown';
    if (!acc[difficulty]) {
      acc[difficulty] = {
        count: 0,
        totalDuration: 0,
        averageScore: 0,
        sessions: []
      };
    }
    
    const duration = this.calculateDuration(session.startTime, session.endTime!);
    acc[difficulty].count++;
    acc[difficulty].totalDuration += duration;
    acc[difficulty].averageScore += session.overallScore || 0;
    acc[difficulty].sessions.push({
      id: session.id,
      title: session.scenario.title,
      duration,
      score: session.overallScore
    });
    
    return acc;
  }, {} as any);

  // Calculate averages
  Object.keys(groups).forEach(difficulty => {
    groups[difficulty].averageDuration = groups[difficulty].totalDuration / groups[difficulty].count;
    groups[difficulty].averageScore = groups[difficulty].averageScore / groups[difficulty].count;
  });

  return groups;
}

private analyzeCompletionTrend(sessions: any[]): any {
  if (sessions.length === 0) {
    return { trend: 'no_data', message: 'No completed sessions available' };
  }

  // Group by month
  const monthlyData = sessions.reduce((acc, session) => {
    const monthKey = this.getMonthKey(session.endTime!);
    if (!acc[monthKey]) {
      acc[monthKey] = {
        month: monthKey,
        count: 0,
        totalDuration: 0,
        totalScore: 0,
        sessions: []
      };
    }
    
    const duration = this.calculateDuration(session.startTime, session.endTime!);
    acc[monthKey].count++;
    acc[monthKey].totalDuration += duration;
    acc[monthKey].totalScore += session.overallScore || 0;
    acc[monthKey].sessions.push(session.id);
    
    return acc;
  }, {} as any);

  // Convert to array and sort by date
  const monthlyArray = Object.values(monthlyData).sort((a: any, b: any) => 
    new Date(a.month).getTime() - new Date(b.month).getTime()
  );

  // Calculate averages and trends
  monthlyArray.forEach((month: any) => {
    month.averageDuration = month.totalDuration / month.count;
    month.averageScore = month.totalScore / month.count;
  });

  // Analyze trends
  const trend = this.calculateCompletionTrend(monthlyArray);
  
  return {
    monthlyData: monthlyArray,
    trend,
    summary: this.generateTrendSummary(trend, monthlyArray)
  };
}

private getMonthKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

private calculateCompletionTrend(monthlyData: any[]): any {
  if (monthlyData.length < 2) {
    return { direction: 'insufficient_data', strength: 0 };
  }

  // Calculate session count trend
  const sessionCounts = monthlyData.map((m: any) => m.count);
  const sessionTrend = this.calculateLinearTrend(sessionCounts);

  // Calculate score trend
  const scores = monthlyData.map((m: any) => m.averageScore);
  const scoreTrend = this.calculateLinearTrend(scores);

  // Calculate duration trend (shorter durations = more efficient)
  const durations = monthlyData.map((m: any) => m.averageDuration);
  const durationTrend = this.calculateLinearTrend(durations);

  return {
    sessionCount: {
      direction: sessionTrend.slope > 0 ? 'increasing' : sessionTrend.slope < 0 ? 'decreasing' : 'stable',
      strength: Math.abs(sessionTrend.slope),
      confidence: sessionTrend.confidence
    },
    performance: {
      direction: scoreTrend.slope > 0 ? 'improving' : scoreTrend.slope < 0 ? 'declining' : 'stable',
      strength: Math.abs(scoreTrend.slope),
      confidence: scoreTrend.confidence
    },
    efficiency: {
      direction: durationTrend.slope < 0 ? 'improving' : durationTrend.slope > 0 ? 'declining' : 'stable',
      strength: Math.abs(durationTrend.slope),
      confidence: durationTrend.confidence
    }
  };
}

private calculateLinearTrend(data: number[]): { slope: number; confidence: number } {
  if (data.length < 2) return { slope: 0, confidence: 0 };

  const n = data.length;
  const x = Array.from({ length: n }, (_, i) => i);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, _, i) => a + x[i]! * data[i]!, 0);
  const sumXX = x.reduce((a, b) => a + b * b, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  
  // Simple confidence calculation based on data consistency
  const mean = sumY / n;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const confidence = Math.max(0, 1 - Math.sqrt(variance) / (mean || 1));
  
  return { slope, confidence };
}

private generateTrendSummary(trend: any, monthlyData: any[]): string {
  const lastMonth = monthlyData[monthlyData.length - 1];
  const firstMonth = monthlyData[0];

  const summaries = [];

  if (trend.sessionCount.direction === 'increasing') {
    summaries.push(`Completed ${lastMonth.count} sessions this month (up from ${firstMonth.count})`);
  } else if (trend.sessionCount.direction === 'decreasing') {
    summaries.push(`Session completion decreased to ${lastMonth.count} this month`);
  }

  if (trend.performance.direction === 'improving') {
    const improvement = ((lastMonth.averageScore - firstMonth.averageScore) * 100).toFixed(1);
    summaries.push(`Performance improved by ${improvement}%`);
  }

  if (trend.efficiency.direction === 'improving') {
    const timeSaved = firstMonth.averageDuration - lastMonth.averageDuration;
    summaries.push(`Became ${this.formatDuration(timeSaved)} more efficient per session`);
  }

  return summaries.join('. ') || 'Consistent performance maintained';
}


}
