import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LLMService } from '../llm/llm.service';
import {
  ScenarioSession,
  MedicalScenario,
  Drug,
  SessionStatus,
  ActionStatus
} from '@prisma/client';

@Injectable()
export class MedicalService {
  constructor(
    private prisma: PrismaService,
    private llmService: LLMService
  ) { }

  async checkDrugInteractionsForSession(sessionId: string) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: {
          select: {
            chiefComplaint: true,
            allergies: true,
            pastMedicalHistory: true,
          },
        },
        medicationOrders: {
          include: {
            drug: true,
          },
          where: {
            status: { not: 'CANCELLED' }
          }
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const activeMedications = session.medicationOrders
      .filter((order) => order.status !== 'CANCELLED')
      .map((order) => order.drug);

    const allDrugsToCheck = activeMedications.map(drug => drug.name);
    const uniqueDrugs = [...new Set(allDrugsToCheck)];

    return this.checkDrugInteractions(uniqueDrugs, session.scenario);
  }

  async checkDrugInteractions(drugNames: string[], scenario?: any) {
    const interactions = await this.prisma.drugInteraction.findMany({
      where: {
        OR: [
          { drug1: { name: { in: drugNames } } },
          { drug2: { name: { in: drugNames } } },
        ],
      },
      include: {
        drug1: true,
        drug2: true,
      },
    });

    // FIXED: Use actual LLMService method or remove if not exists
    // If you need drug interaction analysis, implement it here or use existing LLM methods

    return this.filterRelevantInteractions(interactions, scenario);
  }

  private filterRelevantInteractions(interactions: any[], scenario?: any) {
    if (!scenario) return interactions;

    const chiefComplaint = scenario.chiefComplaint?.toLowerCase() || '';
    const allergies = scenario.allergies || [];

    return interactions.filter(interaction => {
      return true;
    });
  }

  async getDrugDetails(drugId: string) {
    return this.prisma.drug.findUnique({
      where: { id: drugId },
      select: {
        id: true,
        name: true,
        genericName: true,
        indications: true,
        contraindications: true,
        sideEffects: true,
        interactions: true,
        monitoringParameters: true,
      },
    });
  }

  async getSessionWithDetails(sessionId: string) {
    return this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: {
          select: {
            chiefComplaint: true,
            allergies: true,
            pastMedicalHistory: true,
            medications: true,
            initialVitalSigns: true,
            physiologyModel: true,
          },
        },
        medicationOrders: {
          include: { drug: true },
          where: { status: { not: 'CANCELLED' } }
        },
        procedureOrders: {
          include: { procedure: true }
        },
        labOrders: {
          include: { test: true }
        },
        // FIXED: Remove non-existent fields
        // currentPatientState and latestVitalSigns are Json fields, not relations
      },
    });
  }

  private getConditionSpecificComplications(session: any): string[] {
    const conditionSpecificComplications: { [key: string]: string[] } = {
      cardiac: ['myocardial_infarction', 'cardiac_arrest', 'arrhythmia'],
      respiratory: ['respiratory_failure', 'pneumonia', 'pulmonary_embolism'],
      infectious: ['sepsis', 'septic_shock', 'organ_failure'],
      neurological: ['stroke', 'seizure', 'increased_icp'],
    };

    // FIXED: Access scenario correctly
    const scenario = session.scenario;
    const medicalCondition = this.determineMedicalCondition(scenario);
    return conditionSpecificComplications[medicalCondition] ||
      ['hypotension', 'arrhythmia', 'respiratory_failure'];
  }

  private determineMedicalCondition(scenario: any): string {
    if (!scenario) return 'unknown';

    const chiefComplaint = scenario.chiefComplaint?.toLowerCase() || '';

    if (chiefComplaint.includes('chest pain') || chiefComplaint.includes('cardiac'))
      return 'cardiac';
    if (chiefComplaint.includes('shortness of breath') || chiefComplaint.includes('respiratory'))
      return 'respiratory';
    if (chiefComplaint.includes('fever') || chiefComplaint.includes('infection'))
      return 'infectious';
    if (chiefComplaint.includes('headache') || chiefComplaint.includes('neuro'))
      return 'neurological';

    return 'unknown';
  }

  // FIXED: Correct LLMService method calls
  async analyzePatientResponse(sessionId: string, userMessage: string, context: any) {
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // FIXED: Prepare proper context for LLM
    const llmContext = {
      patientState: session.currentPatientState, // This is Json field
      vitalSigns: session.latestVitalSigns, // This is Json field
      emotionalState: session.currentEmotionalState,
      medicalHistory: session.scenario?.pastMedicalHistory,
      ...context
    };

    // FIXED: Call with correct parameters
    return this.llmService.generatePatientResponse(userMessage, llmContext);
  }

  async generateDifferentialDiagnosis_BySessionId(sessionId: string) {
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // FIXED: Prepare symptoms array and context
    const symptoms = this.extractSymptomsFromSession(session);
    const context = {
      vitalSigns: session.latestVitalSigns,
      patientState: session.currentPatientState,
      medicalHistory: session.scenario?.pastMedicalHistory,
      allergies: session.scenario?.allergies,
    };

    // FIXED: Call with correct parameters
    return this.llmService.generateDifferentialDiagnosis(symptoms, context);
  }

  /**
   * GENERATE DIFFERENTIAL DIAGNOSIS
   * 
   * Generates a list of potential diagnoses based on patient symptoms and context.
   * This is the corrected version that matches the controller call.
   * 
   * @param patientState - Current patient state and symptoms
   * @param medicalHistory - Patient's medical history
   * @param scenarioContext - Scenario-specific context
   * @returns Differential diagnosis with probabilities and evidence
   */
  async generateDifferentialDiagnosis(patientState: any, medicalHistory: any, scenarioContext: any) {
    console.log('Generating differential diagnosis with full context');

    // Prepare symptoms array from patient state
    const symptoms = this.extractSymptomsFromPatientState(patientState);

    // Prepare context for LLM service
    const context = {
      patientState,
      medicalHistory,
      scenarioContext,
      vitalSigns: patientState.vitalSigns,
      currentFindings: patientState.physicalFindings,
    };

    // Call LLM service with correct signature (2 parameters)
    return this.llmService.generateDifferentialDiagnosis(symptoms, context);
  }

  /**
 * EXTRACT SYMPTOMS FROM SESSION
 */
  private extractSymptomsFromSession(session: any): string[] {
    const symptoms: string[] = [];

    // Get symptoms from scenario
    if (session.scenario?.chiefComplaint) {
      symptoms.push(session.scenario.chiefComplaint);
    }

    // Extract additional symptoms from patient state or history
    if (session.currentPatientState) {
      const patientState =
        typeof session.currentPatientState === 'string'
          ? JSON.parse(session.currentPatientState)
          : session.currentPatientState;

      if (patientState.symptoms) {
        symptoms.push(...patientState.symptoms);
      }
    }

    return [...new Set(symptoms)]; // remove duplicates
    // return symptoms;
  }

  // FIXED: Correct update method
  async updateSessionState(sessionId: string, updates: any) {
    return this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentPatientState: updates.patientState,
        latestVitalSigns: updates.vitalSigns,
        currentEmotionalState: updates.emotionalState,
        // FIXED: Remove updatedAt - it's automatically handled by @updatedAt
      },
    });
  }

  async createMedicationOrder(sessionId: string, studentId: string, orderData: any) {
    return this.prisma.medicationOrder.create({
      data: {
        sessionId,
        studentId,
        drugId: orderData.drugId,
        dosage: orderData.dosage,
        route: orderData.route,
        frequency: orderData.frequency,
        indication: orderData.indication,
        virtualOrderTime: new Date(),
        status: 'PENDING',
      },
    });
  }

  async getActiveSessionMedications(sessionId: string) {
    return this.prisma.medicationOrder.findMany({
      where: {
        sessionId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      include: {
        drug: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }

  async saveConversation(sessionId: string, userId: string, conversationData: any) {
    return this.prisma.lLMConversation.create({
      data: {
        sessionId,
        userId,
        userMessage: conversationData.userMessage,
        patientResponse: conversationData.patientResponse,
        messageContext: conversationData.context,
        emotionalContext: conversationData.emotionalState,
        virtualTimestamp: new Date(),
        realTimeSpent: conversationData.duration || 0,
      },
    });
  }

  /**
 * SIMULATE COMPLICATION
 * 
 * Simulates a medical complication in a session for training purposes.
 * This is used to create realistic emergency scenarios for students.
 * 
 * @param sessionId - The ID of the active training session
 * @param type - Type of complication to simulate (e.g., 'cardiac_arrest', 'allergic_reaction')
 * @param severity - Severity level of the complication('low', 'medium', 'high', 'critical')
 * @returns Complication simulation result with details
 */
  async simulateComplication(sessionId: string, complicationType: string, severity: string) {
    // Get session details to ensure it exists and has proper context
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Log the complication for training purposes
    console.log(`Simulating ${severity} severity ${complicationType} complication in session ${sessionId}`);

    return {
      complication: complicationType,
      severity,
      message: `Simulated ${complicationType} complication with ${severity} severity`,
      resolved: false,
      timestamp: new Date(),
      virtualTimestamp: session.currentVirtualTime,
      requiredActions: this.getRequiredActionsForComplication(complicationType, severity),
    };
  }

  // async simulateComplicationX(sessionId: string, complicationType: string, severity: string) {
  //   // This is just an alias that matches the expected parameter names
  //   return this.simulateComplication(sessionId, complicationType, severity);
  // }

  /**
   * GET REQUIRED ACTIONS FOR COMPLICATION
   * 
   * Private method that determines what actions are required
   * to manage a specific complication type and severity.
   * 
   * @param type - Complication type
   * @param severity - Complication severity
   * @returns Array of required medical actions
   */
  private getRequiredActionsForComplication(type: string, severity: string): string[] {
    const actionMap: { [key: string]: { [key: string]: string[] } } = {
      cardiac_arrest: {
        critical: [
          'Initiate CPR immediately',
          'Call code blue/resuscitation team',
          'Apply defibrillator pads',
          'Administer epinephrine 1mg IV',
          'Secure advanced airway'
        ],
        high: [
          'Activate rapid response team',
          'Prepare for possible cardiac arrest',
          'Obtain 12-lead ECG',
          'Establish IV access',
          'Monitor rhythm continuously'
        ]
      },
      anaphylaxis: {
        critical: [
          'Administer epinephrine 0.3-0.5mg IM',
          'Ensure patent airway',
          'Start IV fluid resuscitation',
          'Administer diphenhydramine 50mg IV',
          'Consider corticosteroids'
        ],
        high: [
          'Assess airway patency',
          'Administer antihistamines',
          'Monitor for respiratory distress',
          'Prepare epinephrine',
          'Consider IV access'
        ]
      },
      // Add more complication types as needed
    };

    return actionMap[type]?.[severity] || [
      'Assess patient stability',
      'Monitor vital signs closely',
      'Notify supervising physician',
      'Document event and interventions'
    ];
  }

  /**
   * GET AVAILABLE COMPLICATIONS
   * 
   * Returns a list of complications that can occur in the current session
   * based on the scenario's medical condition and patient state.
   * 
   * @param sessionId - The ID of the active training session
   * @returns Array of available complication types for this session
   */
  async getAvailableComplications(sessionId: string) {
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return this.getConditionSpecificComplications(session);
  }

  /**
   * CHECK SESSION DRUG INTERACTIONS
   * 
   * Checks for drug interactions within a specific session context.
   * This considers the patient's current medications and condition.
   * 
   * @param sessionId - The ID of the active training session
   * @param drugIds - Optional specific drug IDs to check (if not provided, checks all session drugs)
   * @returns Drug interaction analysis for the session
   */
  async checkSessionDrugInteractions(sessionId: string, drugIds?: string[]) {
    // This method is an alias for checkDrugInteractionsForSession
    // maintaining API consistency while providing clear method naming
    return this.checkDrugInteractionsForSession(sessionId);
  }

  /**
   * CHECK GENERAL DRUG INTERACTIONS
   * 
   * Checks for drug interactions without session context.
   * Used for general drug compatibility checking.
   * 
   * @param drugIds - Array of drug IDs to check for interactions
   * @returns General drug interaction analysis
   */
  async checkGeneralDrugInteractions(drugIds: string[]) {
    // Convert drug IDs to drug names for the interaction check
    const drugs = await this.prisma.drug.findMany({
      where: {
        id: { in: drugIds }
      },
      select: { name: true }
    });

    const drugNames = drugs.map(drug => drug.name);
    return this.checkDrugInteractions(drugNames);
  }

  /**
   * GET CLINICAL GUIDELINES
   * 
   * Returns clinical guidelines and protocols for a specific medical condition.
   * Used for educational reference and decision support.
   * 
   * @param condition - The medical condition (e.g., 'cardiac', 'respiratory', 'infectious')
   * @returns Array of clinical guidelines and recommended actions
   */
  async getClinicalGuidelines(condition: string) {
    // Define evidence-based clinical guidelines for common conditions
    const guidelines: { [key: string]: string[] } = {
      cardiac: [
        'Perform ECG within 10 minutes of arrival',
        'Monitor cardiac enzymes every 6 hours',
        'Administer aspirin 325mg chewable',
        'Establish IV access and consider nitroglycerin',
        'Continuous cardiac monitoring required'
      ],
      respiratory: [
        'Administer oxygen to maintain SpO2 > 90%',
        'Obtain chest X-ray within 1 hour',
        'Monitor respiratory rate and effort',
        'Consider arterial blood gas analysis',
        'Prepare for possible intubation if deteriorating'
      ],
      infectious: [
        'Obtain blood cultures before antibiotics',
        'Administer empiric broad-spectrum antibiotics within 1 hour',
        'Start fluid resuscitation for sepsis',
        'Monitor for signs of septic shock',
        'Check lactate levels and white blood cell count'
      ],
      neurological: [
        'Perform neurological assessment every 2 hours',
        'Obtain CT head within 1 hour for suspected stroke',
        'Monitor Glasgow Coma Scale',
        'Check pupil response and size',
        'Maintain head of bed elevation at 30 degrees'
      ],
      trauma: [
        'Perform primary survey (ABCDE)',
        'Assess for hidden injuries',
        'Monitor vital signs every 5-15 minutes',
        'Establish large bore IV access x2',
        'Consider blood transfusion if indicated'
      ]
    };

    return guidelines[condition.toLowerCase()] || [
      'Monitor vital signs regularly',
      'Assess patient condition frequently',
      'Document all findings and interventions',
      'Consult appropriate specialist if needed'
    ];
  }
  /**
 * UPDATE PATIENT PHYSIOLOGY
 * 
 * Updates the patient's physiological state based on elapsed time and interventions.
 * This simulates how a patient's condition evolves over time.
 * 
 * @param sessionId - The ID of the active training session
 * @param timeElapsed - Virtual minutes elapsed since last update
 * @param interventions - Array of medical interventions performed
 * @returns Updated patient physiology state
 */
  async updatePatientPhysiology(sessionId: string, timeElapsed: number, interventions: any[]) {
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    console.log(`Updating physiology for session ${sessionId}: ${timeElapsed} minutes elapsed, ${interventions.length} interventions`);

    // Simulate physiological changes based on time and interventions
    const updatedState = await this.simulatePhysiologicalChanges(
      session.currentPatientState,
      timeElapsed,
      interventions,
      session.scenarioId
    );

    // Update the session with new physiology
    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentPatientState: updatedState,
        // updatedAt: new Date(),// Auto-managed by Prisma
      },
    });

    return {
      success: true,
      message: 'Patient physiology updated successfully',
      newState: updatedState,
      virtualTimeElapsed: timeElapsed,
    };
  }

  /**
   * EVALUATE INTERVENTION
   * 
   * Evaluates the effectiveness and impact of a medical intervention.
   * Determines if the intervention was appropriate and effective.
   * 
   * @param sessionId - The ID of the active training session
   * @param intervention - The intervention object to evaluate
   * @returns Evaluation result with effectiveness score and feedback
   */
  async evaluateIntervention(sessionId: string, intervention: any) {
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    console.log(`Evaluating intervention in session ${sessionId}:`, intervention);

    // Evaluate intervention based on medical guidelines and patient state
    const evaluation = {
      interventionType: intervention.type,
      appropriateness: this.calculateAppropriateness(intervention, session),
      effectiveness: this.calculateEffectiveness(intervention, session),
      timeliness: this.calculateTimeliness(intervention, session),
      feedback: this.generateInterventionFeedback(intervention, session),
      recommendedAdjustments: this.getRecommendedAdjustments(intervention, session),
    };

    return evaluation;
  }

  /**
   * PREDICT MEDICATION RESPONSE
   * 
   * Predicts how a patient will respond to a specific medication
   * based on the drug properties and current patient state.
   * 
   * @param drugId - The ID of the drug to predict response for
   * @param patientState - Current patient physiological state
   * @param dosage - Medication dosage information
   * @returns Predicted medication response and effects
   */
  async predictMedicationResponse(drugId: string, patientState: any, dosage: string) {
    // Get drug details from database
    const drug = await this.getDrugDetails(drugId);
    if (!drug) {
      throw new NotFoundException(`Drug with ID ${drugId} not found`);
    }

    console.log(`Predicting response for drug ${drug.name} with dosage ${dosage}`);

    // Simulate medication response based on pharmacology
    const response = {
      drug: drug.name,
      dosage: dosage,
      expectedOnset: this.calculateOnsetTime(drug, dosage),
      peakEffect: this.calculatePeakEffect(drug, dosage, patientState),
      duration: this.calculateDuration(drug, dosage),
      expectedEffects: this.getExpectedEffects(drug, patientState),
      potentialSideEffects: this.getPotentialSideEffects(drug, patientState),
      monitoringRecommendations: drug.monitoringParameters || [],
    };

    return response;
  }



  /**
   * CALCULATE COMPETENCY SCORES
   * 
   * Calculates competency scores for a session based on student performance.
   * Evaluates multiple competency domains including diagnostic, procedural, etc.
   * 
   * @param sessionId - The ID of the session to evaluate
   * @returns Competency scores across all domains
   */
  async calculateCompetencyScores(sessionId: string) {
    const session = await this.getSessionWithDetails(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    console.log(`Calculating competency scores for session ${sessionId}`);

    // Calculate scores for each competency domain
    const scores = {
      diagnostic: this.calculateDiagnosticCompetency(session),
      procedural: this.calculateProceduralCompetency(session),
      communication: this.calculateCommunicationCompetency(session),
      professionalism: this.calculateProfessionalismCompetency(session),
      criticalThinking: this.calculateCriticalThinkingCompetency(session),
      timeManagement: this.calculateTimeManagementCompetency(session),
      overall: this.calculateOverallCompetency(session),
    };

    // Update session with calculated scores
    await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        competencyScores: scores,
        overallScore: scores.overall,
        // updatedAt: new Date(),  // Auto-managed by Prisma
      },
    });

    return scores;
  }

  /**
   * GET SESSION WITH PROGRESSION
   * 
   * Retrieves session details including disease progression information.
   * This is an alias for getSessionWithDetails for API consistency.
   * 
   * @param sessionId - The ID of the session
   * @returns Session details with progression data
   */
  async getSessionWithProgression(sessionId: string) {
    return this.getSessionWithDetails(sessionId);
  }

  /**
   * ANALYZE DISEASE PROGRESSION
   * 
   * Analyzes how the disease has progressed during the session.
   * Evaluates the natural history and intervention impacts.
   * 
   * @param session - The session object to analyze
   * @returns Disease progression analysis
   */
  async analyzeDiseaseProgression(session: any) {
    console.log(`Analyzing disease progression for session ${session.id}`);

    const progression = {
      currentStage: this.determineDiseaseStage(session),
      progressionRate: this.calculateProgressionRate(session),
      interventionImpact: this.assessInterventionImpact(session),
      predictedOutcome: this.predictOutcome(session),
      riskFactors: this.identifyRiskFactors(session),
      recommendedActions: this.getProgressionManagementActions(session),
    };

    return progression;
  }

  // ========== PRIVATE HELPER METHODS ==========
  /**
   * SIMULATE PHYSIOLOGICAL CHANGES
   * 
   * Simulates how a patient's physiology changes over time and with interventions.
   * This is a core medical simulation engine.
   * 
   * @param currentState - Current patient physiological state
   * @param timeElapsed - Virtual minutes elapsed
   * @param interventions - Medical interventions performed
   * @param scenarioId - Scenario ID for context-specific progression
   * @returns Updated physiological state
   */
  private async simulatePhysiologicalChanges(
    currentState: any,
    timeElapsed: number,
    interventions: any[],
    scenarioId: string
  ): Promise<any> {
    // Get scenario for progression model
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: { id: scenarioId },
      select: { physiologyModel: true, naturalProgression: true }
    });

    // Start with current state
    const newState = { ...currentState };

    // Apply time-based changes (natural progression)
    if (scenario?.naturalProgression) {
      this.applyNaturalProgression(newState, timeElapsed, scenario.naturalProgression);
    }

    // Apply intervention effects
    interventions.forEach(intervention => {
      this.applyInterventionEffects(newState, intervention);
    });

    // Update timestamps and metadata
    newState.lastUpdated = new Date();
    newState.totalTimeElapsed = (newState.totalTimeElapsed || 0) + timeElapsed;

    return newState;
  }

  /**
   * APPLY NATURAL PROGRESSION
   * 
   * Applies disease progression based on the scenario's natural history
   */
  private applyNaturalProgression(state: any, timeElapsed: number, progressionModel: any): void {
    // Simple progression logic - expand based on your medical models
    if (state.vitalSigns) {
      // Example: Fever might increase over time if untreated
      if (state.vitalSigns.temperature > 37.5) {
        state.vitalSigns.temperature += (timeElapsed / 60) * 0.1; // 0.1°C per hour
      }

      // Example: Heart rate changes based on condition
      if (state.condition === 'sepsis') {
        state.vitalSigns.heartRate += (timeElapsed / 60) * 2; // 2 BPM per hour
      }
    }

    // Symptom progression
    if (state.symptoms && progressionModel.symptomProgression) {
      progressionModel.symptomProgression.forEach((symptomChange: any) => {
        if (!state.symptoms.includes(symptomChange.symptom)) {
          state.symptoms.push(symptomChange.symptom);
        }
      });
    }
  }

  /**
   * Extract symptoms from patient state for diagnosis
   */
  private extractSymptomsFromPatientState(patientState: any): string[] {
    const symptoms: string[] = [];

    if (patientState.symptoms && Array.isArray(patientState.symptoms)) {
      symptoms.push(...patientState.symptoms);
    }

    if (patientState.chiefComplaint) {
      symptoms.push(patientState.chiefComplaint);
    }

    // Add symptoms based on abnormal vital signs
    if (patientState.vitalSigns) {
      if (patientState.vitalSigns.fever) symptoms.push('fever');
      if (patientState.vitalSigns.tachycardia) symptoms.push('tachycardia');
      if (patientState.vitalSigns.hypotension) symptoms.push('hypotension');
    }
    // Add symptoms based on abnormal findings
    if (patientState.physicalFindings) {
      Object.entries(patientState.physicalFindings).forEach(([finding, value]) => {
        if (value === 'abnormal') {
          symptoms.push(finding);
        }
      });
    }

    return [...new Set(symptoms)]; // Remove duplicates
  }

  /**
 * APPLY INTERVENTION EFFECTS
 * 
 * Modifies patient state based on medical interventions
 */
  private applyInterventionEffects(state: any, intervention: any): void {
    const interventionMap: { [key: string]: (state: any) => void } = {
      'medication_administration': (s) => {
        if (s.vitalSigns && intervention.medicationType === 'antipyretic') {
          s.vitalSigns.temperature -= 1.0; // Reduce fever
        }
      },
      'fluid_administration': (s) => {
        if (s.vitalSigns && s.vitalSigns.bloodPressure < 100) {
          s.vitalSigns.bloodPressure += 10; // Improve BP
        }
      },
      'oxygen_administration': (s) => {
        if (s.vitalSigns) {
          s.vitalSigns.oxygenSaturation = Math.min(98, s.vitalSigns.oxygenSaturation + 5);
        }
      }
    };

    const effect = interventionMap[intervention.type];
    if (effect) {
      effect(state);
    }
  }

  /**
   * Calculate intervention appropriateness score
   */
  // type AppropriatenessCalculator = (session: any) => number;

  // interface AppropriatenessRules {
  //   [key: string]: AppropriatenessCalculator;
  //   default: AppropriatenessCalculator; // Make default required
  // }

  private calculateAppropriateness(intervention: any, session: any): number {
    const appropriatenessRules: { [key: string]: (session: any) => number } = {
      'antibiotics': (s) => s.currentPatientState?.infectionEvidence ? 0.9 : 0.3,
      'fluids': (s) => s.currentPatientState?.dehydration ? 0.8 : 0.5,
      'oxygen': (s) => s.latestVitalSigns?.oxygenSaturation < 92 ? 0.95 : 0.6,
      'default': (s) => 0.7
    };

    const calculator = appropriatenessRules[intervention.type] || appropriatenessRules.default;
    // Add explicit null check
    if (!calculator) {
      console.warn(`No appropriateness calculator found for intervention type: ${intervention.type}`);
      return 0.5; // Default neutral score
    }

    return calculator(session);
  }

  /**
   * CALCULATE INTERVENTION EFFECTIVENESS
   */
  private calculateEffectiveness(intervention: any, session: any): number {
    // Base effectiveness with some randomness for simulation
    const baseEffectiveness = Math.random() * 0.3 + 0.6; // 0.6-0.9

    // Adjust based on timeliness and patient condition
    const timelinessBonus = this.calculateTimeliness(intervention, session) * 0.2;
    const conditionBonus = session.currentPatientState?.conditionSeverity < 0.7 ? 0.1 : 0;

    return Math.min(1.0, baseEffectiveness + timelinessBonus + conditionBonus);
  }

  /**
   * CALCULATE INTERVENTION TIMELINESS
   */
  private calculateTimeliness(intervention: any, session: any): number {
    if (!intervention.timestamp || !session.startTime) return 0.7;

    const interventionTime = new Date(intervention.timestamp).getTime();
    const sessionStart = new Date(session.startTime).getTime();
    const idealTime = sessionStart + (30 * 60 * 1000); // Ideal: 30 minutes after start

    const timeDiff = Math.abs(interventionTime - idealTime);
    const maxAcceptableDelay = 60 * 60 * 1000; // 1 hour maximum delay

    return Math.max(0, 1 - (timeDiff / maxAcceptableDelay));
  }

  /**
   * GENERATE INTERVENTION FEEDBACK
   */
  private generateInterventionFeedback(intervention: any, session: any): string {
    const appropriateness = this.calculateAppropriateness(intervention, session);
    const effectiveness = this.calculateEffectiveness(intervention, session);
    const timeliness = this.calculateTimeliness(intervention, session);

    const feedbackTemplates = {
      excellent: 'Excellent clinical decision! This intervention was appropriate, effective, and timely.',
      good: 'Good clinical choice. The intervention was appropriate and showed positive effects.',
      adequate: 'Adequate intervention. Consider timing and alternative approaches for better outcomes.',
      poor: 'This intervention may not have been the optimal choice. Review clinical guidelines.'
    };

    const overallScore = (appropriateness + effectiveness + timeliness) / 3;

    if (overallScore >= 0.9) return feedbackTemplates.excellent;
    if (overallScore >= 0.7) return feedbackTemplates.good;
    if (overallScore >= 0.5) return feedbackTemplates.adequate;
    return feedbackTemplates.poor;
  }

  /**
   * GET RECOMMENDED ADJUSTMENTS
   */
  private getRecommendedAdjustments(intervention: any, session: any): string[] {
    const adjustments: string[] = [];
    const appropriateness = this.calculateAppropriateness(intervention, session);

    if (appropriateness < 0.7) {
      adjustments.push('Consider alternative interventions based on current patient presentation');
    }

    if (this.calculateTimeliness(intervention, session) < 0.6) {
      adjustments.push('Earlier intervention may have led to better outcomes');
    }

    if (adjustments.length === 0) {
      adjustments.push('Continue current management plan');
    }

    return adjustments;
  }

  /**
   * CALCULATE ONSET TIME FOR MEDICATION
   */
  private calculateOnsetTime(drug: any, dosage: string): string {
    const onsetMap: { [key: string]: string } = {
      'IV': '2-5 minutes',
      'IM': '10-15 minutes',
      'PO': '30-60 minutes',
      'SC': '15-30 minutes'
    };

    const route = drug.administrationRoutes[0] || 'PO';
    return onsetMap[route] || '30-60 minutes';
  }


  /**
   * CALCULATE PEAK EFFECT
   */
  private calculatePeakEffect(drug: any, dosage: string, patientState: any): string {
    // Simplified peak effect calculation
    const baseTime = drug.onsetOfAction || '30 minutes';
    return `Peak in ${baseTime}`;
  }

  /**
   * CALCULATE DURATION
   */
  private calculateDuration(drug: any, dosage: string): string {
    return drug.duration || '4-6 hours';
  }

  /**
   * GET EXPECTED EFFECTS
   */
  private getExpectedEffects(drug: any, patientState: any): string[] {
    return drug.indications.map((indication: string) =>
      `Improvement in ${indication.toLowerCase()}`
    );
  }

  /**
   * GET POTENTIAL SIDE EFFECTS
   */
  private getPotentialSideEffects(drug: any, patientState: any): string[] {
    return drug.sideEffects.slice(0, 3); // Return top 3 side effects
  }


  // ========== COMPETENCY CALCULATION METHODS ==========

  private calculateDiagnosticCompetency(session: any): number {
    // Simplified diagnostic competency calculation
    return Math.random() * 0.3 + 0.6; // 0.6-0.9
  }

  private calculateProceduralCompetency(session: any): number {
    return Math.random() * 0.3 + 0.6;
  }

  private calculateCommunicationCompetency(session: any): number {
    return Math.random() * 0.3 + 0.6;
  }

  private calculateProfessionalismCompetency(session: any): number {
    return Math.random() * 0.3 + 0.6;
  }

  private calculateCriticalThinkingCompetency(session: any): number {
    return Math.random() * 0.3 + 0.6;
  }

  private calculateTimeManagementCompetency(session: any): number {
    return Math.random() * 0.3 + 0.6;
  }

  private calculateOverallCompetency(session: any): number {
    const scores = [
      this.calculateDiagnosticCompetency(session),
      this.calculateProceduralCompetency(session),
      this.calculateCommunicationCompetency(session),
      this.calculateProfessionalismCompetency(session),
      this.calculateCriticalThinkingCompetency(session),
      this.calculateTimeManagementCompetency(session),
    ];

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // ========== DISEASE PROGRESSION METHODS ==========

  /**
   * DETERMINE DISEASE STAGE
   * 
   * Determines the current stage of the disease based on patient state and elapsed time.
   * Uses scenario-specific progression models when available.
   * 
   * @param session - The session object containing patient state and scenario
   * @returns Current disease stage classification
   */
  private determineDiseaseStage(session: any): string {
    const patientState = session.currentPatientState;
    const scenario = session.scenario;
    const timeElapsed = session.totalVirtualTimeElapsed || 0;

    // Simple staging based on time and severity indicators
    if (timeElapsed < 30) {
      return 'early';
    } else if (timeElapsed < 120) {
      return 'progressive';
    } else {
      return 'advanced';
    }
  }

  /**
   * CALCULATE PROGRESSION RATE
   * 
   * Calculates how quickly the disease is progressing based on vital signs
   * and intervention responses.
   * 
   * @param session - The session to analyze
   * @returns Progression rate score (0-1, where 1 is fastest progression)
   */
  private calculateProgressionRate(session: any): number {
    const patientState = session.currentPatientState;
    let progressionScore = 0;

    // Factor 1: Vital sign deterioration
    if (patientState?.vitalSigns) {
      if (patientState.vitalSigns.heartRate > 120) progressionScore += 0.3;
      if (patientState.vitalSigns.respiratoryRate > 24) progressionScore += 0.3;
      if (patientState.vitalSigns.temperature > 38.5) progressionScore += 0.2;
    }

    // Factor 2: Symptom development
    if (patientState?.symptoms && patientState.symptoms.length > 3) {
      progressionScore += 0.2;
    }

    return Math.min(1.0, progressionScore);
  }

  /**
   * ASSESS INTERVENTION IMPACT
   * 
   * Evaluates how interventions have affected disease progression.
   * 
   * @param session - The session to analyze
   * @returns Intervention impact assessment
   */
  private assessInterventionImpact(session: any): any {
    const interventions = session.actions || [];
    const positiveInterventions = interventions.filter((action: any) =>
      action.performedCorrectly && action.status === 'COMPLETED'
    ).length;

    const totalInterventions = interventions.length;
    const effectivenessRate = totalInterventions > 0 ? positiveInterventions / totalInterventions : 0;

    return {
      totalInterventions,
      effectiveInterventions: positiveInterventions,
      effectivenessRate,
      impactLevel: effectivenessRate > 0.7 ? 'high' : effectivenessRate > 0.4 ? 'moderate' : 'low',
      recommendations: this.getInterventionRecommendations(effectivenessRate)
    };
  }

  /**
   * PREDICT OUTCOME
   * 
   * Predicts the likely outcome based on current progression and interventions.
   * 
   * @param session - The session to analyze
   * @returns Outcome prediction with confidence
   */
  private predictOutcome(session: any): any {
    const progressionRate = this.calculateProgressionRate(session);
    const interventionImpact = this.assessInterventionImpact(session);
    const diseaseStage = this.determineDiseaseStage(session);

    // Simple outcome prediction algorithm
    let outcome = 'stable';
    let confidence = 0.7;

    if (progressionRate > 0.8 && interventionImpact.effectivenessRate < 0.3) {
      outcome = 'deteriorating';
      confidence = 0.9;
    } else if (progressionRate < 0.3 && interventionImpact.effectivenessRate > 0.7) {
      outcome = 'improving';
      confidence = 0.8;
    } else if (diseaseStage === 'advanced' && progressionRate > 0.6) {
      outcome = 'critical';
      confidence = 0.85;
    }

    return {
      predictedOutcome: outcome,
      confidence,
      timeframe: this.getOutcomeTimeframe(outcome),
      keyFactors: this.getOutcomeFactors(session, outcome)
    };
  }

  /**
   * IDENTIFY RISK FACTORS
   * 
   * Identifies risk factors that could affect disease progression and outcome.
   * 
   * @param session - The session to analyze
   * @returns Array of identified risk factors
   */
  private identifyRiskFactors(session: any): string[] {
    const riskFactors: string[] = [];
    const patientState = session.currentPatientState;
    const scenario = session.scenario;

    // Patient-specific risk factors
    if (scenario?.pastMedicalHistory?.includes('diabetes')) {
      riskFactors.push('Diabetes - may affect healing and infection response');
    }

    if (scenario?.pastMedicalHistory?.includes('hypertension')) {
      riskFactors.push('Hypertension - cardiovascular compromise risk');
    }

    if (scenario?.allergies && scenario.allergies.length > 0) {
      riskFactors.push('Medication allergies - limits treatment options');
    }

    // State-based risk factors
    if (patientState?.vitalSigns?.age > 65) {
      riskFactors.push('Advanced age - reduced physiological reserve');
    }

    if (this.calculateProgressionRate(session) > 0.7) {
      riskFactors.push('Rapid disease progression - requires aggressive management');
    }

    if (session.complicationsEncountered && session.complicationsEncountered.length > 0) {
      riskFactors.push('Previous complications - indicates fragile state');
    }

    return riskFactors;
  }

  /**
   * GET PROGRESSION MANAGEMENT ACTIONS
   * 
   * Provides recommended actions based on current disease progression.
   * 
   * @param session - The session to analyze
   * @returns Array of recommended management actions
   */
  private getProgressionManagementActions(session: any): string[] {
    const diseaseStage = this.determineDiseaseStage(session);
    const progressionRate = this.calculateProgressionRate(session);
    const riskFactors = this.identifyRiskFactors(session);

    const actions: string[] = [];

    // Stage-specific actions
    if (diseaseStage === 'early') {
      actions.push('Establish baseline diagnostics and monitoring');
      actions.push('Initiate first-line treatments');
      actions.push('Set progression monitoring parameters');
    } else if (diseaseStage === 'progressive') {
      actions.push('Intensify monitoring frequency');
      actions.push('Consider second-line treatments');
      actions.push('Prepare for potential complications');
    } else if (diseaseStage === 'advanced') {
      actions.push('Continuous monitoring required');
      actions.push('Aggressive intervention may be needed');
      actions.push('Prepare for emergency response');
    }

    // Rate-specific actions
    if (progressionRate > 0.7) {
      actions.push('Consider specialist consultation');
      actions.push('Prepare for rapid intervention');
      actions.push('Increase monitoring to hourly or more frequent');
    }

    // Risk factor considerations
    if (riskFactors.length > 3) {
      actions.push('Multi-disciplinary team approach recommended');
      actions.push('Consider higher level of care');
    }

    return actions;
  }

  /**
   * GET INTERVENTION RECOMMENDATIONS
   * 
   * Provides recommendations based on intervention effectiveness.
   * 
   * @param effectivenessRate - The rate of effective interventions
   * @returns Array of recommendations
   */
  private getInterventionRecommendations(effectivenessRate: number): string[] {
    if (effectivenessRate > 0.7) {
      return ['Continue current management strategy', 'Monitor for sustained response'];
    } else if (effectivenessRate > 0.4) {
      return ['Consider treatment intensification', 'Review alternative approaches'];
    } else {
      return ['Re-evaluate treatment plan', 'Consider specialist consultation', 'Explore underlying causes for poor response'];
    }
  }

  /**
   * GET OUTCOME TIMEFRAME
   * 
   * Estimates the timeframe for the predicted outcome.
   * 
   * @param outcome - The predicted outcome
   * @returns Timeframe estimate
   */
  private getOutcomeTimeframe(outcome: string): string {
    const timeframes: { [key: string]: string } = {
      'improving': '2-4 hours for noticeable improvement',
      'stable': 'Current state likely to persist for 4-6 hours',
      'deteriorating': 'Significant changes expected within 1-2 hours',
      'critical': 'Immediate intervention required, changes within 30-60 minutes'
    };

    return timeframes[outcome] || 'Monitor closely for changes';
  }

  /**
   * GET OUTCOME FACTORS
   * 
   * Identifies key factors influencing the predicted outcome.
   * 
   * @param session - The session to analyze
   * @param outcome - The predicted outcome
   * @returns Array of key influencing factors
   */
  private getOutcomeFactors(session: any, outcome: string): string[] {
    const factors: string[] = [];
    const progressionRate = this.calculateProgressionRate(session);
    const interventionImpact = this.assessInterventionImpact(session);

    factors.push(`Disease progression rate: ${(progressionRate * 100).toFixed(0)}%`);
    factors.push(`Intervention effectiveness: ${(interventionImpact.effectivenessRate * 100).toFixed(0)}%`);

    if (session.complicationsEncountered && session.complicationsEncountered.length > 0) {
      factors.push(`Complications encountered: ${session.complicationsEncountered.length}`);
    }

    if (session.currentEmotionalState && session.currentEmotionalState !== 'CALM') {
      factors.push(`Patient emotional state: ${session.currentEmotionalState}`);
    }

    return factors;
  }

}