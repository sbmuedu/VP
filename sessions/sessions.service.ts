// src/sessions/sessions.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LLMService } from '../llm/llm.service';
import {
  ScenarioSession,
  MedicalScenario,
  User,
  SessionStatus,
  TimeFlowMode,
  AssessmentType,
  EmotionalState,
  ActionStatus,
  EventPriority,
  UserRole,
} from '@prisma/client';

// Import DTOs
import {
  StartSessionDto,
  PerformActionDto,
  FastForwardDto,
  PatientQuestionDto,
  EndSessionDto,
  UpdateTimeFlowModeDto,
  AddSupervisorDto,
  CreateInterventionDto,
} from './dto/sessions.dto';

/**
 * SESSION WITH SCENARIO TYPE
 * 
 * Extended type that includes related scenario and user information.
 * Used for type-safe return values from session queries.
 */
type SessionWithScenario = ScenarioSession & {
  scenario: MedicalScenario & {
    creator: Pick<User, 'id' | 'firstName' | 'lastName' | 'specialization'>;
  };
  student: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>;
  supervisor?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>;
};

/**
 * SESSIONS SERVICE
 * 
 * Core service responsible for managing medical training sessions.
 * Handles session lifecycle, medical actions, time management, and LLM integration.
 * 
 * KEY RESPONSIBILITIES:
 * - Session creation and lifecycle management
 * - Medical action processing and simulation
 * - Virtual time management
 * - Patient communication via LLM
 * - Supervisor interventions
 * - Session assessment and feedback
 * 
 * @Injectable Decorator allows this service to be injected into controllers
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  /**
   * SERVICE CONSTRUCTOR
   * 
   * Dependency injection of required services:
   * - PrismaService: Database operations and data access
   * - LLMService: AI-powered patient responses and medical reasoning
   * 
   * @param prisma - Database service for all data operations
   * @param llmService - AI service for patient simulation and medical reasoning
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
  ) {
    this.logger.log('SessionsService initialized');
  }

  /**
   * START A NEW MEDICAL TRAINING SESSION
   * 
   * Creates a new training session based on a medical scenario.
   * Initializes patient state, sets up timing, and prepares the learning environment.
   * 
   * WORKFLOW:
   * 1. Validate scenario existence and accessibility
   * 2. Check for existing active sessions
   * 3. Create initial patient state from scenario
   * 4. Create session record with initial state
   * 5. Return session with related data
   * 
   * @param userId - ID of the student starting the session
   * @param startSessionDto - DTO containing scenario and assessment information
   * @returns Complete session object with scenario and student data
   * @throws NotFoundException if scenario doesn't exist or is inactive
   * @throws BadRequestException if user already has an active session
   */
  async startSession(userId: string, startSessionDto: StartSessionDto): Promise<SessionWithScenario> {
    this.logger.log(`Starting new session for user ${userId} with scenario ${startSessionDto.scenarioId}`);

    // Step 1: Verify scenario exists and is accessible
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: {
        id: startSessionDto.scenarioId,
        isActive: true
      },
    });

    if (!scenario) {
      this.logger.warn(`Scenario not found or inactive: ${startSessionDto.scenarioId}`);
      throw new NotFoundException('Scenario not found or inactive');
    }

    // Step 2: Check for existing active sessions
    const existingSession = await this.prisma.scenarioSession.findFirst({
      where: {
        studentId: userId,
        status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
    });

    if (existingSession) {
      this.logger.warn(`User ${userId} already has active session: ${existingSession.id}`);
      throw new BadRequestException(
        'You already have an active session. Please end it before starting a new one.'
      );
    }

    // Step 3: Create initial patient state from scenario (FIXED JSON)
    const initialPatientState = this.createInitialPatientState(scenario);

    // Ensure vital signs are proper JSON
    const initialVitalSigns = scenario.initialVitalSigns
      ? JSON.parse(JSON.stringify(scenario.initialVitalSigns))
      : {};

    // Step 4: Create new session record (FIXED JSON fields)
    const session = await this.prisma.scenarioSession.create({
      data: {
        scenarioId: startSessionDto.scenarioId,
        studentId: userId,
        assessmentType: startSessionDto.assessmentType,
        currentVirtualTime: new Date(),
        lastRealTimeUpdate: new Date(),
        timeFlowMode: TimeFlowMode.REAL_TIME,
        currentPatientState: initialPatientState, // Now proper JSON
        currentEmotionalState: scenario.initialEmotionalState,
        latestVitalSigns: initialVitalSigns, // Now proper JSON
        completedSteps: [],
        complicationsEncountered: [],
        timePressureEnabled: scenario.requiresTimePressure,
        // Initialize other required fields
        totalRealTimeElapsed: 0,
        totalVirtualTimeElapsed: 0,
        mistakesMade: null,
        interventionsReceived: null,
        activeMedications: null,
        competencyScores: null,
        overallScore: null,
        timeEfficiencyScore: null,
        stressPerformanceScore: null,
        finalFeedback: null,
        parentSessionId: null,
        userId: null, // Add this if your schema requires it
      },
      include: {
        scenario: {
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                specialization: true
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
            role: true
          },
        },
      },
    });

    this.logger.log(`Session started successfully: ${session.id}`);
    return session as SessionWithScenario;
  }

  /**
   * GET SESSION DETAILS WITH COMPLETE RELATED DATA
   * 
   * Retrieves a session with all related information including:
   * - Scenario details and creator information
   * - Student and supervisor information
   * - Medical orders and actions
   * - Conversations and interventions
   * 
   * ACCESS CONTROL:
   * - Student can access their own sessions
   * - Supervisor can access sessions they supervise
   * - Admins/Medical Experts can access all sessions
   * 
   * @param sessionId - Unique identifier of the session
   * @param userId - ID of the user requesting access
   * @param userRole - Role of the user for permission checking
   * @returns Complete session object with all related data
   * @throws NotFoundException if session doesn't exist
   * @throws ForbiddenException if user doesn't have access permissions
   */
  async getSession(sessionId: string, userId: string, userRole: UserRole): Promise<SessionWithScenario> {
    this.logger.log(`Fetching session ${sessionId} for user ${userId}`);

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
                specialization: true
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
            role: true
          },
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          },
        },
        medicationOrders: {
          include: {
            drug: true,
            student: {
              select: { firstName: true, lastName: true }
            }
          },
        },
        procedureOrders: {
          include: {
            procedure: true,
            student: {
              select: { firstName: true, lastName: true }
            }
          },
        },
        labOrders: {
          include: {
            test: true,
            student: {
              select: { firstName: true, lastName: true }
            }
          },
        },
        imagingOrders: {
          include: {
            study: true,
            student: {
              select: { firstName: true, lastName: true }
            }
          },
        },
        examOrders: {
          include: {
            exam: true,
            student: {
              select: { firstName: true, lastName: true }
            }
          },
        },
        actions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            initiatedBy: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        conversations: {
          orderBy: { timestamp: 'desc' },
          take: 10,
          include: {
            user: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        interventions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            supervisor: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        timeEvents: {
          orderBy: { virtualTimeScheduled: 'desc' },
          take: 10,
        },
      },
    });

    if (!session) {
      this.logger.warn(`Session not found: ${sessionId}`);
      throw new NotFoundException('Session not found');
    }

    // Check access permissions
    this.checkSessionAccess(session, userId, userRole);

    this.logger.log(`Session retrieved successfully: ${sessionId}`);
    return session as SessionWithScenario;
  }

  /**
 * PERFORM MEDICAL ACTION DURING SESSION
 * 
 * Processes a medical intervention or action performed by the student.
 * Records the action, simulates outcomes, and updates patient state.
 * 
 * ACTION PROCESSING STEPS:
 * 1. Validate session is active
 * 2. Create action record with initial status
 * 3. Simulate medical outcome based on action type
 * 4. Update action with results and feedback
 * 5. Update session state based on action outcomes
 * 
 * @param sessionId - ID of the active session
 * @param userId - ID of the student performing the action
 * @param performActionDto - DTO containing action details and parameters
 * @returns Action record with outcome and session updates
 * @throws BadRequestException if session is not active
 */
  async performAction(
    sessionId: string,
    userId: string,
    performActionDto: PerformActionDto
  ): Promise<{ action: any; outcome: any }> {
    this.logger.log(`Performing action in session ${sessionId} by user ${userId}`);

    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    if (session.status !== SessionStatus.ACTIVE) {
      this.logger.warn(`Cannot perform action on inactive session: ${sessionId}`);
      throw new BadRequestException('Cannot perform actions on inactive session');
    }

    // Ensure actionDetails is proper JSON
    const jsonSafeActionDetails = JSON.parse(JSON.stringify(performActionDto.actionDetails));

    // Create action record with initial status
    const action = await this.prisma.medicalAction.create({
      data: {
        sessionId,
        initiatedById: userId,
        actionType: performActionDto.actionType,
        actionDetails: jsonSafeActionDetails, // Now proper JSON
        priority: performActionDto.priority,
        status: ActionStatus.IN_PROGRESS,
        realTimeStarted: new Date(),
        virtualTimeStarted: session.currentVirtualTime,
        // Initialize other required fields
        realTimeRequired: null,
        virtualTimeRequired: null,
        realTimeCompleted: null,
        virtualTimeCompleted: null,
        expectedOutcome: {"o2":20},
        actualOutcome: {"o2":20},
        consequenceSeverity: null,
        expectedCompletionVirtualTime: null,
        canBeFastForwarded: true,
        performedCorrectly: null,
        feedback: null,
        timePenalty: null,
      },
    });

    // Simulate medical outcome based on action type
    const actionResult = await this.simulateActionOutcome(performActionDto, session);

    // Update action with results and feedback
    const updatedAction = await this.prisma.medicalAction.update({
      where: { id: action.id },
      data: {
        status: actionResult.success ? ActionStatus.COMPLETED : ActionStatus.FAILED,
        realTimeCompleted: new Date(),
        virtualTimeCompleted: session.currentVirtualTime,
        actualOutcome: JSON.parse(JSON.stringify(actionResult.result)), // Ensure JSON
        performedCorrectly: actionResult.success,
        feedback: actionResult.feedback,
        consequenceSeverity: actionResult.consequenceSeverity,
      },
    });

    // Update session state based on action outcomes
    if (actionResult.sessionStateUpdates) {
      await this.updateSessionState(sessionId, actionResult.sessionStateUpdates);
    }

    // Record complications if any occurred
    if (actionResult.complications && actionResult.complications.length > 0) {
      await this.recordComplications(sessionId, actionResult.complications);
    }

    this.logger.log(`Action completed: ${action.id} with success: ${actionResult.success}`);

    return {
      action: updatedAction,
      outcome: actionResult,
    };
  }
  /**
   * FAST FORWARD VIRTUAL TIME IN ACCELERATED MODE
   * 
   * Advances virtual time to simulate passage of time for training efficiency.
   * Processes time-based events like medication effects, lab results, and condition changes.
   * 
   * TIME PROCESSING STEPS:
   * 1. Validate session is in accelerated mode
   * 2. Calculate real-time equivalent based on acceleration rate
   * 3. Update session time tracking
   * 4. Process time-based events and state changes
   * 5. Return updated session and triggered events
   * 
   * @param sessionId - ID of the session to fast forward
   * @param userId - ID of the student requesting time advance
   * @param fastForwardDto - DTO containing virtual minutes to advance
   * @returns Updated session and any triggered time-based events
   * @throws BadRequestException if session is not in accelerated mode
   */
  async fastForwardTime(
    sessionId: string,
    userId: string,
    fastForwardDto: FastForwardDto
  ): Promise<{
    session: SessionWithScenario;
    triggeredEvents: any[];
    realTimeElapsed: number;
    virtualTimeElapsed: number;
  }> {
    this.logger.log(`Fast-forwarding session ${sessionId} by ${fastForwardDto.virtualMinutes} minutes`);

    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    // Validate session is in accelerated mode
    if (session.timeFlowMode !== TimeFlowMode.ACCELERATED) {
      throw new BadRequestException('Session is not in accelerated time mode');
    }

    // Calculate real time equivalent based on acceleration rate
    const realTimeSeconds = this.calculateRealTimeEquivalent(
      fastForwardDto.virtualMinutes,
      session.scenario.timeAccelerationRate
    );

    // Update session time tracking
    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        totalVirtualTimeElapsed: session.totalVirtualTimeElapsed + fastForwardDto.virtualMinutes,
        totalRealTimeElapsed: session.totalRealTimeElapsed + realTimeSeconds,
        currentVirtualTime: new Date(
          session.currentVirtualTime.getTime() + fastForwardDto.virtualMinutes * 60000
        ),
        lastRealTimeUpdate: new Date(),
      },
      include: {
        scenario: {
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true, specialization: true },
            },
          },
        },
        student: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    // Process time-based events (medication effects, lab results, condition changes)
    const triggeredEvents = await this.processTimeBasedEvents(
      sessionId,
      fastForwardDto.virtualMinutes
    );

    // Update patient state based on time passage
    await this.updatePatientStateOverTime(sessionId, fastForwardDto.virtualMinutes);

    this.logger.log(`Time fast-forwarded: ${fastForwardDto.virtualMinutes} virtual minutes`);

    return {
      session: updatedSession as SessionWithScenario,
      triggeredEvents,
      realTimeElapsed: realTimeSeconds,
      virtualTimeElapsed: fastForwardDto.virtualMinutes,
    };
  }

  /**
   * ASK PATIENT QUESTION VIA LLM INTEGRATION
   * 
   * Uses AI to generate realistic patient responses to student questions.
   * Maintains conversation context and medical accuracy.
   * 
   * CONVERSATION PROCESSING:
   * 1. Validate session is active
   * 2. Generate patient response using LLM with medical context
   * 3. Save conversation for assessment and continuity
   * 4. Return response with conversation metadata
   * 
   * @param sessionId - ID of the active session
   * @param userId - ID of the student asking the question
   * @param patientQuestionDto - DTO containing question and context
   * @returns Patient response with conversation metadata
   * @throws BadRequestException if session is not active
   */
  async askPatientQuestion(
    sessionId: string,
    userId: string,
    patientQuestionDto: PatientQuestionDto
  ): Promise<{
    question: string;
    response: string;
    conversationId: string;
    emotionalContext: EmotionalState;
    medicalAccuracy?: number;
  }> {
    this.logger.log(`Processing patient question in session ${sessionId}`);

    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    // Validate session is active
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Cannot ask questions in inactive session');
    }

    // Prepare context for LLM
    const llmContext = {
      patientState: session.currentPatientState,
      medicalHistory: session.scenario.pastMedicalHistory,
      emotionalState: session.currentEmotionalState,
      chiefComplaint: session.scenario.chiefComplaint,
      currentSymptoms: session.currentPatientState?.symptoms || [],
      context: patientQuestionDto.context,
      conversationHistory: await this.getRecentConversations(sessionId, 5),
    };

    // Generate patient response using LLM
    const patientResponse = await this.llmService.generatePatientResponse(
      patientQuestionDto.question,
      llmContext
    );

    // Save conversation for continuity and assessment
    const conversation = await this.prisma.lLMConversation.create({
      data: {
        sessionId,
        userId,
        userMessage: patientQuestionDto.question,
        patientResponse: patientResponse.response,
        messageContext: patientQuestionDto.context,
        emotionalContext: session.currentEmotionalState,
        virtualTimestamp: session.currentVirtualTime,
        realTimeSpent: patientResponse.thinkingTime || 5,
        medicalAccuracy: patientResponse.accuracy,
        appropriateness: patientResponse.appropriateness,
        emotionalAppropriateness: patientResponse.emotionalAppropriateness,
        conversationDepth: await this.calculateConversationDepth(sessionId),
      },
    });

    // Update emotional state based on conversation if needed
    if (patientResponse.emotionalImpact) {
      await this.updateEmotionalState(sessionId, patientResponse.emotionalImpact);
    }

    this.logger.log(`Patient question processed: ${conversation.id}`);

    return {
      question: patientQuestionDto.question,
      response: patientResponse.response,
      conversationId: conversation.id,
      emotionalContext: session.currentEmotionalState,
      medicalAccuracy: patientResponse.accuracy,
    };
  }

  /**
   * END TRAINING SESSION
   * 
   * Properly concludes a training session and prepares for assessment.
   * Updates status, records end time, and allows final feedback.
   * 
   * SESSION COMPLETION STEPS:
   * 1. Validate session can be ended (not already completed/cancelled)
   * 2. Update session status and end time
   * 3. Record final feedback if provided
   * 4. Trigger assessment processing if summative
   * 
   * @param sessionId - ID of the session to end
   * @param userId - ID of the student ending the session
   * @param endSessionDto - DTO containing optional final feedback
   * @returns Updated session object
   * @throws BadRequestException if session is already ended
   */
  async endSession(
    sessionId: string,
    userId: string,
    endSessionDto: EndSessionDto
  ): Promise<SessionWithScenario> {
    this.logger.log(`Ending session: ${sessionId}`);

    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    // Validate session can be ended
    if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.CANCELLED) {
      throw new BadRequestException('Session is already ended');
    }

    // Update session with completion data
    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.COMPLETED,
        endTime: new Date(),
        finalFeedback: endSessionDto.finalFeedback,
        timeFlowMode: TimeFlowMode.PAUSED, // Stop time flow
      },
      include: {
        scenario: {
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true, specialization: true },
            },
          },
        },
        student: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        supervisor: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    // Trigger assessment processing for summative assessments
    if (session.assessmentType === AssessmentType.SUMMATIVE) {
      await this.triggerSummativeAssessment(sessionId);
    }

    this.logger.log(`Session ended successfully: ${sessionId}`);
    return updatedSession as SessionWithScenario;
  }

  /**
   * PAUSE ACTIVE SESSION
   * 
   * Temporarily pauses an active session, freezing virtual time.
   * Useful for breaks, consultations, or technical issues.
   * 
   * @param sessionId - ID of the session to pause
   * @param userId - ID of the student pausing the session
   * @returns Updated session object
   * @throws BadRequestException if session is not active
   */
  async pauseSession(sessionId: string, userId: string): Promise<ScenarioSession> {
    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Only active sessions can be paused');
    }

    this.logger.log(`Pausing session: ${sessionId}`);

    return this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.PAUSED,
        lastRealTimeUpdate: new Date(),
      },
    });
  }

  /**
   * RESUME PAUSED SESSION
   * 
   * Resumes a previously paused session, restoring time flow.
   * Maintains session state and continues from where it left off.
   * 
   * @param sessionId - ID of the session to resume
   * @param userId - ID of the student resuming the session
   * @returns Updated session object
   * @throws BadRequestException if session is not paused
   */
  async resumeSession(sessionId: string, userId: string): Promise<ScenarioSession> {
    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    if (session.status !== SessionStatus.PAUSED) {
      throw new BadRequestException('Only paused sessions can be resumed');
    }

    this.logger.log(`Resuming session: ${sessionId}`);

    return this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.ACTIVE,
        lastRealTimeUpdate: new Date(),
      },
    });
  }

  /**
   * UPDATE TIME FLOW MODE
   * 
   * Changes how virtual time progresses in relation to real time.
   * Allows switching between real-time and accelerated simulation.
   * 
   * @param sessionId - ID of the session to update
   * @param userId - ID of the student updating the mode
   * @param updateTimeFlowModeDto - DTO containing new time flow mode
   * @returns Updated session object
   */
  async updateTimeFlowMode(
    sessionId: string,
    userId: string,
    updateTimeFlowModeDto: UpdateTimeFlowModeDto
  ): Promise<ScenarioSession> {
    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    this.logger.log(`Updating time flow mode to ${updateTimeFlowModeDto.timeFlowMode} for session ${sessionId}`);

    return this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        timeFlowMode: updateTimeFlowModeDto.timeFlowMode,
        lastRealTimeUpdate: new Date(),
      },
    });
  }

  /**
   * ADD SUPERVISOR TO SESSION
   * 
   * Assigns a supervisor to monitor and guide a training session.
   * Supervisors can provide interventions and real-time feedback.
   * 
   * @param sessionId - ID of the session to supervise
   * @param userId - ID of the user adding the supervisor (must be student or admin)
   * @param addSupervisorDto - DTO containing supervisor user ID
   * @returns Updated session with supervisor information
   * @throws NotFoundException if supervisor user doesn't exist or isn't qualified
   */
  async addSupervisor(
    sessionId: string,
    userId: string,
    addSupervisorDto: AddSupervisorDto
  ): Promise<SessionWithScenario> {
    const session = await this.getSession(sessionId, userId, UserRole.STUDENT);

    // Verify supervisor exists and has appropriate role
    const supervisor = await this.prisma.user.findUnique({
      where: {
        id: addSupervisorDto.supervisorId,
        role: { in: [UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN] },
        isActive: true,
      },
    });

    if (!supervisor) {
      throw new NotFoundException('Supervisor not found or does not have appropriate role');
    }

    this.logger.log(`Adding supervisor ${supervisor.id} to session ${sessionId}`);

    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        supervisorId: addSupervisorDto.supervisorId,
      },
      include: {
        scenario: {
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true, specialization: true },
            },
          },
        },
        student: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        supervisor: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    return updatedSession as SessionWithScenario;
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * CHECK SESSION ACCESS PERMISSIONS
   * 
   * Validates that a user has permission to access a specific session.
   * Access is granted to:
   * - The student who owns the session
   * - The supervisor assigned to the session
   * - Administrators and medical experts
   * 
   * @param session - Session object to check access for
   * @param userId - ID of the user requesting access
   * @param userRole - Role of the user for permission validation
   * @throws ForbiddenException if user doesn't have access permissions
   */
  private checkSessionAccess(session: ScenarioSession, userId: string, userRole: UserRole): void {
    const isStudent = session.studentId === userId;
    const isSupervisor = session.supervisorId === userId;
    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.MEDICAL_EXPERT;

    if (!isStudent && !isSupervisor && !isAdmin) {
      this.logger.warn(`Access denied for user ${userId} to session ${session.id}`);
      throw new ForbiddenException('Access denied to this session');
    }
  }

  /**
   * CREATE INITIAL PATIENT STATE FROM SCENARIO
   * 
   * Generates the initial patient state based on scenario configuration.
   * Sets up vital signs, symptoms, and initial findings.
   * 
   * @param scenario - Medical scenario providing initial state configuration
   * @returns Complete initial patient state object
   */
  private createInitialPatientState(scenario: MedicalScenario): any {
    const initialPatientState = {
      vitalSigns: scenario.initialVitalSigns,
      symptoms: [scenario.chiefComplaint],
      mentalStatus: 'Alert and oriented',
      physicalFindings: {},
      labResults: [],
      treatmentResponse: [],
      lastUpdated: new Date().toISOString(),
      conditionSeverity: 'moderate',
      stability: 'stable',
    };

    // Ensure we're returning a plain JavaScript object, not a custom type
    return JSON.parse(JSON.stringify(initialPatientState));
  }

  /**
   * CALCULATE REAL TIME EQUIVALENT FOR VIRTUAL TIME
   * 
   * Converts virtual minutes to real seconds based on acceleration rate.
   * Used for time tracking and session duration calculations.
   * 
   * @param virtualMinutes - Number of virtual minutes to convert
   * @param accelerationRate - Scenario's time acceleration rate (virtual minutes per real minute)
   * @returns Equivalent real time in seconds
   */
  private calculateRealTimeEquivalent(virtualMinutes: number, accelerationRate: number): number {
    return Math.floor((virtualMinutes * 60) / accelerationRate);
  }

  /**
   * SIMULATE ACTION OUTCOME WITH MEDICAL LOGIC
   * 
   * Simulates the outcome of a medical action based on type and context.
   * In a real implementation, this would include complex medical reasoning.
   * 
   * @param actionDto - DTO containing action details
   * @param session - Current session state for context
   * @returns Simulated action outcome with success status and effects
   */
  private async simulateActionOutcome(
    actionDto: PerformActionDto,
    session: SessionWithScenario
  ): Promise<{
    success: boolean;
    result: any;
    feedback: string;
    sessionStateUpdates?: any;
    complications?: any[];
    consequenceSeverity?: number;
  }> {
    // Base success rate with some randomness for simulation
    const baseSuccessRate = 0.8;
    const success = Math.random() > (1 - baseSuccessRate);

    // Generate appropriate feedback based on action type and success
    const feedback = this.generateActionFeedback(actionDto.actionType, success);

    // Simulate some state updates based on action type (ensure JSON safety)
    const stateUpdates = JSON.parse(JSON.stringify(
      this.simulateStateUpdates(actionDto, session, success)
    ));

    // Occasionally simulate complications (ensure JSON safety)
    const complications = success
      ? []
      : JSON.parse(JSON.stringify(this.simulateComplications(actionDto)));

    return {
      success,
      result: JSON.parse(JSON.stringify({
        message: success ? 'Action completed successfully' : 'Action encountered issues',
        details: actionDto.actionDetails,
        timestamp: new Date().toISOString(),
      })),
      feedback,
      sessionStateUpdates: stateUpdates,
      complications,
      consequenceSeverity: success ? 0 : Math.random() * 0.5 + 0.1, // 0.1-0.6 for failures
    };
  }

  /**
   * GENERATE ACTION-SPECIFIC FEEDBACK
   */
  private generateActionFeedback(actionType: string, success: boolean): string {
    const feedbackMap = {
      physical_exam: {
        success: 'Thorough examination with appropriate findings documented',
        failure: 'Consider more systematic approach to physical examination'
      },
      medication: {
        success: 'Appropriate medication selection and administration',
        failure: 'Review medication indications and contraindications'
      },
      procedure: {
        success: 'Procedure performed with good technique',
        failure: 'Consider additional preparation or technique refinement'
      },
      default: {
        success: 'Action performed appropriately',
        failure: 'Consider alternative approach or additional assessment'
      }
    };

    const feedback = feedbackMap[actionType] || feedbackMap.default;
    return success ? feedback.success : feedback.failure;
  }

  /**
   * SIMULATE STATE UPDATES BASED ON ACTION
   */
  private simulateStateUpdates(
    actionDto: PerformActionDto,
    session: SessionWithScenario,
    success: boolean
  ): any {
    const updates: any = {
      lastAction: actionDto.actionType,
      lastActionTime: new Date(),
    };

    // Simulate some condition improvements for successful actions
    if (success) {
      if (actionDto.actionType === 'medication' && actionDto.actionDetails.medicationType === 'analgesic') {
        updates.painLevel = 'decreased';
      }
    }

    return updates;
  }

  /**
   * SIMULATE COMPLICATIONS FOR FAILED ACTIONS
   */
  private simulateComplications(actionDto: PerformActionDto): any[] {
    const complications = [];

    if (Math.random() > 0.7) { // 30% chance of complication
      complications.push({
        type: 'minor_complication',
        description: 'Minor issue encountered during procedure',
        severity: 'low',
        requiredAction: 'Monitor and document'
      });
    }

    return complications;
  }

  /**
   * UPDATE SESSION STATE WITH NEW DATA
   */
  private async updateSessionState(sessionId: string, updates: any): Promise<void> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      select: { currentPatientState: true },
    });

    if (!session) return;

    const currentState = session.currentPatientState as any;

    // Ensure updates are proper JSON by serializing/deserializing
    const jsonSafeUpdates = JSON.parse(JSON.stringify(updates));
    const updatedState = { ...currentState, ...jsonSafeUpdates };

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentPatientState: updatedState,
      },
    });
  }

  /**
   * PROCESS TIME-BASED EVENTS DURING FAST FORWARD
   */
  private async processTimeBasedEvents(sessionId: string, virtualMinutes: number): Promise<any[]> {
    const events = [];

    // Simulate lab results becoming available
    if (virtualMinutes > 30 && Math.random() > 0.7) {
      events.push({
        type: 'lab_result_ready',
        message: 'Laboratory test results are now available for review',
        virtualTime: new Date(),
        priority: EventPriority.MEDIUM,
      });
    }

    // Simulate medication effects
    if (virtualMinutes > 15 && Math.random() > 0.6) {
      events.push({
        type: 'medication_effect',
        message: 'Administered medication is taking effect',
        virtualTime: new Date(),
        priority: EventPriority.LOW,
      });
    }

    // Simulate patient condition changes
    if (virtualMinutes > 45 && Math.random() > 0.8) {
      events.push({
        type: 'patient_condition_change',
        message: 'Patient condition has changed - requires reassessment',
        virtualTime: new Date(),
        priority: EventPriority.HIGH,
      });
    }

    // Create time events in database
    for (const event of events) {
      await this.prisma.timeEvent.create({
        data: {
          sessionId,
          eventType: event.type,
          eventData: { message: event.message },
          virtualTimeScheduled: event.virtualTime,
          virtualTimeTriggered: new Date(),
          realTimeTriggered: new Date(),
          requiresAttention: event.priority === EventPriority.HIGH,
          severity: event.priority,
        },
      });
    }

    return events;
  }

  /**
   * UPDATE PATIENT STATE OVER TIME
   */
  // In a real implementation, this would include complex physiological modeling
  // For now, we'll simulate some basic changes
  private async updatePatientStateOverTime(sessionId: string, virtualMinutes: number): Promise<void> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      select: { currentPatientState: true, scenarioId: true },
    });

    if (!session) return;

    const currentState = session.currentPatientState as any;
    const updatedState = JSON.parse(JSON.stringify(currentState));

    // Simulate some time-based changes
    if (virtualMinutes > 60) {
      // Patient might become more distressed over time if untreated
      if (Math.random() > 0.5) {
        updatedState.conditionSeverity = 'worsening';
      }
    }

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentPatientState: updatedState,
      },
    });
  }

  /**
   * GET RECENT CONVERSATIONS FOR CONTEXT
   */
  private async getRecentConversations(sessionId: string, limit: number): Promise<any[]> {
    const conversations = await this.prisma.lLMConversation.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        userMessage: true,
        patientResponse: true,
        emotionalContext: true,
        timestamp: true,
      },
    });

    return conversations.reverse(); // Return in chronological order
  }

  /**
   * CALCULATE CONVERSATION DEPTH FOR LLM CONTEXT
   */
  private async calculateConversationDepth(sessionId: string): Promise<number> {
    const conversationCount = await this.prisma.lLMConversation.count({
      where: { sessionId },
    });

    return Math.min(conversationCount + 1, 10); // Cap at 10 for context management
  }

  /**
   * UPDATE PATIENT EMOTIONAL STATE
   */
  private async updateEmotionalState(sessionId: string, emotionalImpact: any): Promise<void> {
    // Simple emotional state transition logic
    // In real implementation, this would be more sophisticated
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      select: { currentEmotionalState: true },
    });

    if (!session) return;

    let newEmotionalState = session.currentEmotionalState;

    // Simple state transitions based on impact
    if (emotionalImpact.intensity > 0.7) {
      if (emotionalImpact.positive) {
        newEmotionalState = EmotionalState.CALM;
      } else {
        newEmotionalState = EmotionalState.ANXIOUS;
      }
    }

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentEmotionalState: newEmotionalState,
      },
    });
  }

  /**
   * RECORD COMPLICATIONS IN SESSION
   */
  private async recordComplications(sessionId: string, complications: any[]): Promise<void> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      select: { complicationsEncountered: true },
    });

    if (!session) return;

    const currentComplications = session.complicationsEncountered;
    const newComplications = complications.map(c => c.type);

    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        complicationsEncountered: [...currentComplications, ...newComplications],
      },
    });
  }

  /**
   * TRIGGER SUMMATIVE ASSESSMENT PROCESSING
   */
  private async triggerSummativeAssessment(sessionId: string): Promise<void> {
    this.logger.log(`Triggering summative assessment for session: ${sessionId}`);

    // In a real implementation, this would trigger complex assessment logic
    // For now, we'll just log the event
    // Assessment would analyze actions, decisions, timing, and outcomes
  }
}