// src/medical/medical.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LLMService } from '../llm/llm.service';
import {
  DiseaseProgressionModel,
  PhysiologyModel,
  MedicationResponseModel,
  ComplicationProbabilityModel
} from './models';

@Injectable()
export class MedicalService {
  // private diseaseModels: Map<string, DiseaseProgressionModel> = new Map();
  // private physiologyModel: PhysiologyModel;
  // private medicationModel: MedicationResponseModel;
  // private complicationModel: ComplicationProbabilityModel;
  private physiologyModel: PhysiologyModel | undefined;
  private complicationModel: ComplicationProbabilityModel | undefined;
  private medicationModel: MedicationResponseModel | undefined;
  private diseaseModels: Map<string, DiseaseProgressionModel> | undefined;

  constructor(
    private prisma: PrismaService,
    private llmService: LLMService,
  ) {
    this.initializeModels();
  }

  /**
   * Updates patient state based on disease progression and interventions
   */
  async updatePatientPhysiology(
    sessionId: string,
    timeElapsed: number,
    interventions: any[],
  ): Promise<{
    vitalSigns: any;
    symptoms: string[];
    mentalStatus: string;
    newComplications: string[];
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    const currentState = session.currentPatientState as any;
    const scenario = session.scenario;

    // Get disease progression model for this scenario
    const diseaseModel = await this.getDiseaseModel(scenario.medicalCondition);

    // Calculate disease progression
    const progression = diseaseModel.calculateProgression(
      timeElapsed,
      currentState,
      interventions
    );

    // Update physiology based on disease progression and interventions
    const physiologicalChanges = this.physiologyModel!.calculateChanges(
      currentState.vitalSigns,
      progression,
      interventions,
      timeElapsed
    );

    // Check for complications
    const complications = this.complicationModel!.evaluateRisk(
      currentState,
      physiologicalChanges,
      interventions,
      scenario.complicationRisks || []
    );

    // Update symptoms based on progression and interventions
    const updatedSymptoms = this.updateSymptoms(
      currentState.symptoms,
      progression,
      interventions,
      physiologicalChanges
    );

    // Update mental status
    const mentalStatus = this.updateMentalStatus(
      currentState.mentalStatus,
      physiologicalChanges,
      // progression
    );

    return {
      vitalSigns: physiologicalChanges,
      symptoms: updatedSymptoms,
      mentalStatus,
      newComplications: complications.newComplications,
    };
  }

  /**
   * Evaluates the appropriateness of a medical intervention
   */
  async evaluateIntervention(
    sessionId: string,
    intervention: {
      type: string;
      details: any;
      timing: Date;
    },
    patientState: any,
  ): Promise<{
    isAppropriate: boolean;
    confidence: number;
    rationale: string;
    alternatives: string[];
    risks: string[];
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Use LLM to evaluate intervention appropriateness
    const evaluation = await this.llmService.evaluateMedicalIntervention(
      intervention,
      patientState,
      session.scenario.learningObjectives,
      session.scenario.medicalCondition
    );

    // Also use rule-based validation
    const ruleBasedValidation = this.validateInterventionRules(
      intervention,
      patientState,
      session.scenario
    );

    return {
      isAppropriate: evaluation.isAppropriate && ruleBasedValidation.isValid,
      confidence: evaluation.confidence,
      rationale: evaluation.rationale,
      alternatives: evaluation.alternatives,
      risks: [...evaluation.risks, ...ruleBasedValidation.risks],
    };
  }

  /**
   * Predicts patient response to medication
   */
  async predictMedicationResponse(
    drugId: string,
    patientState: any,
    dosage: string,
    route: string,
  ): Promise<{
    effectiveness: number;
    onsetTime: number;
    duration: number;
    sideEffects: string[];
    monitoringRecommendations: string[];
  }> {
    const drug = await this.prisma.drug.findUnique({
      where: { id: drugId },
    });

    if (!drug) {
      throw new NotFoundException(`Drug with ID ${drugId} not found`);
    }

    return this.medicationModel!.predictResponse(
      drug,
      patientState,
      dosage,
      route
    );
  }

  /**
   * Generates differential diagnosis based on patient presentation
   */
  async generateDifferentialDiagnosis(
    patientState: any,
    medicalHistory: any,
    scenarioContext?: string,
  ): Promise<{
    diagnoses: Array<{
      condition: string;
      probability: number;
      supportingEvidence: string[];
      conflictingEvidence: string[];
      nextSteps: string[];
    }>;
    criticalConditions: string[];
    recommendedTests: string[];
  }> {
    // Use LLM for intelligent differential diagnosis
    const llmDiagnosis = await this.llmService.generateDifferentialDiagnosis(
      patientState,
      medicalHistory,
      // scenarioContext
    );

    // Map the response to the expected format
    const diagnoses = llmDiagnosis.conditions.map(condition => ({
      condition: condition.condition,
      probability: condition.probability,
      supportingEvidence: condition.evidenceFor,
      conflictingEvidence: condition.evidenceAgainst,
      nextSteps: llmDiagnosis.nextSteps,
    }));

    return {
      diagnoses,
      criticalConditions: llmDiagnosis.conditions
        .filter(c => c.urgency === 'high')
        .map(c => c.condition),
      recommendedTests: llmDiagnosis.nextSteps,
    };

    // // Combine with rule-based diagnosis
    // const ruleBasedDiagnosis = this.generateRuleBasedDiagnosis(
    //   patientState,
    //   medicalHistory
    // );

    // // Merge and rank diagnoses
    // const mergedDiagnoses = this.mergeDiagnoses(
    //   llmDiagnosis.diagnoses,
    //   ruleBasedDiagnosis.diagnoses
    // );

    // return {
    //   diagnoses: mergedDiagnoses,
    //   criticalConditions: [
    //     ...llmDiagnosis.criticalConditions,
    //     ...ruleBasedDiagnosis.criticalConditions,
    //   ],
    //   recommendedTests: [
    //     ...llmDiagnosis.recommendedTests,
    //     ...ruleBasedDiagnosis.recommendedTests,
    //   ],
    // };
  }

  /**
   * Calculates competency scores based on actions and decisions
   */
  async calculateCompetencyScores(
    sessionId: string,
  ): Promise<{
    diagnostic: { score: number; feedback: string; evidence: string[] };
    procedural: { score: number; feedback: string; evidence: string[] };
    communication: { score: number; feedback: string; evidence: string[] };
    professionalism: { score: number; feedback: string; evidence: string[] };
    criticalThinking: { score: number; feedback: string; evidence: string[] };
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        medicalActions: true,
        conversations: true,
        medicationOrders: true,
        labOrders: true,
        procedureOrders: true,
        timeEvents: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Calculate scores based on various factors
    const diagnosticScore = this.calculateDiagnosticCompetency(session);
    const proceduralScore = this.calculateProceduralCompetency(session);
    const communicationScore = this.calculateCommunicationCompetency(session);
    const professionalismScore = this.calculateProfessionalismCompetency(session);
    const criticalThinkingScore = this.calculateCriticalThinkingCompetency(session);

    return {
      diagnostic: diagnosticScore,
      procedural: proceduralScore,
      communication: communicationScore,
      professionalism: professionalismScore,
      criticalThinking: criticalThinkingScore,
    };
  }

  /**
 * Gets session with disease progression data
 */
  async getSessionWithProgression(sessionId: string) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
            medicalCondition: true,
            difficultyLevel: true,
            expectedDuration: true,
            complicationRisks: true,
          },
        },
        currentPatientState: true,
        latestVitalSigns: true,
        complicationsEncountered: true,
        timeEvents: {
          where: {
            eventType: {
              contains: 'complication',
            },
          },
          orderBy: { virtualTimeScheduled: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return session;
  }
  /**
  * Gets analyze Disease session progression data
  */
  async analyzeDiseaseProgression(session: any) {
    return {
      condition: session.scenario.medicalCondition,
      currentStage: this.calculateProgressionStage(session),
      expectedCourse: this.getExpectedCourse(session.scenario),
      complicationsRisk: this.calculateComplicationsRisk(session),
      progressionData: {
        vitalSigns: session.latestVitalSigns,
        complications: session.complicationsEncountered,
        timeElapsed: session.totalVirtualTimeElapsed,
      },
    };
  }

  /**
 * Simulates a specific complication for training purposes
 */
  async simulateComplication(
    sessionId: string,
    complicationType: string,
    severity: number,
    timing?: Date,
  ): Promise<{ success: boolean; complication: any; patientState: any }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Validate session is active
    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('Can only simulate complications in active sessions');
    }

    // Validate severity
    if (severity < 0 || severity > 1) {
      throw new BadRequestException('Severity must be between 0 and 1');
    }

    // Generate complication based on type and severity
    const complication = this.generateComplication(complicationType, severity, session);

    // Apply complication effects to patient state
    const updatedPatientState = this.applyComplicationEffects(
      session.currentPatientState as any,
      complication
    );

    // Update vital signs based on complication
    const updatedVitalSigns = this.updateVitalSignsForComplication(
      session.latestVitalSigns as any,
      complication
    );

    // Create time event for the complication
    const complicationEvent = await this.prisma.timeEvent.create({
      data: {
        sessionId,
        eventType: `complication_${complicationType}`,
        eventData: complication,
        virtualTimeScheduled: timing || session.currentVirtualTime,
        requiresAttention: true,
        isComplication: true,
      },
    });

    // Update session with new patient state and complications
    const updatedSession = await this.prisma.scenarioSession.update({
      where: { id: sessionId },
      data: {
        currentPatientState: updatedPatientState,
        latestVitalSigns: updatedVitalSigns,
        complicationsEncountered: {
          push: complicationType,
        },
      },
    });

    return {
      success: true,
      complication,
      patientState: updatedPatientState,
    };
  }

  /**
 * Checks drug interactions within a specific session context
 */
  async checkSessionDrugInteractions(sessionId: string, drugIds: string[]): Promise<{
    hasInteractions: boolean;
    interactions: Array<{
      drugs: string[];
      severity: 'low' | 'medium' | 'high' | 'contraindicated';
      description: string;
      recommendation: string;
    }>;
    warnings: string[];
  }> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        medicationOrders: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] },
          },
          include: { drug: true },
        },
        scenario: {
          select: {
            chiefComplaint: true,        // Use instead of medicalCondition
            allergies: true,             // Use instead of patientAllergies
            pastMedicalHistory: true,    // Contains contraindication info
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Get current active medications from the session
    const activeMedications = session.medicationOrders
      .filter((order: any) => order.status !== 'CANCELLED')
      .map((order: any) => order.drug);

    // Combine with new drugs to check
    const allDrugsToCheck = [...activeMedications.map((d: any) => d.id), ...drugIds];
    const uniqueDrugs = [...new Set(allDrugsToCheck)];

    return this.checkDrugInteractions(uniqueDrugs, session.scenario);
  }

  /**
   * Checks general drug interactions without session context
   */
  async checkGeneralDrugInteractions(drugIds: string[]): Promise<{
    hasInteractions: boolean;
    interactions: Array<{
      drugs: string[];
      severity: 'low' | 'medium' | 'high' | 'contraindicated';
      description: string;
      recommendation: string;
    }>;
    warnings: string[];
  }> {
    const uniqueDrugs = [...new Set(drugIds)];
    return this.checkDrugInteractions(uniqueDrugs);
  }

  /**
   * Core drug interaction checking logic
   */
  private async checkDrugInteractions(drugIds: string[], scenarioContext?: any): Promise<{
    hasInteractions: boolean;
    interactions: any[];
    warnings: string[];
  }> {
    // Get drug details from database
    const drugs = await this.prisma.drug.findMany({
      where: { id: { in: drugIds } },
      select: {
        id: true,
        name: true,
        category: true,
        contraindications: true,
        interactions: true,
        monitoringParameters: true,
      },
    });

    if (drugs.length !== drugIds.length) {
      throw new BadRequestException('Some drug IDs were not found');
    }

    const interactions = [];
    const warnings = [];

    // Check for known drug-drug interactions
    for (let i = 0; i < drugs.length; i++) {
      for (let j = i + 1; j < drugs.length; j++) {
        const interaction = this.checkSpecificInteraction(drugs[i], drugs[j]);
        if (interaction) {
          interactions.push(interaction);
        }
      }
    }

    // Check for contraindications based on scenario context
    if (scenarioContext) {
      const contraindicationWarnings = this.checkContraindications(drugs, scenarioContext);
      warnings.push(...contraindicationWarnings);
    }

    // Check for black box warnings
    const blackBoxWarnings = drugs
      .filter((drug: any) => drug.blackBoxWarning)
      .map((drug: any) => `Black box warning: ${drug.name} - ${drug.blackBoxWarning}`);
    warnings.push(...blackBoxWarnings);

    return {
      hasInteractions: interactions.length > 0 || warnings.length > 0,
      interactions,
      warnings,
    };
  }

  /**
   * Checks specific interaction between two drugs
   */
  private checkSpecificInteraction(drug1: any, drug2: any): any {
    // Known drug interactions database (simplified - in real app, use a comprehensive database)
    const knownInteractions = [
      {
        drugs: ['warfarin', 'aspirin'],
        severity: 'high' as const,
        description: 'Increased bleeding risk',
        recommendation: 'Monitor INR closely, consider alternative antiplatelet',
      },
      {
        drugs: ['simvastatin', 'clarithromycin'],
        severity: 'high' as const,
        description: 'Increased risk of myopathy/rhabdomyolysis',
        recommendation: 'Avoid combination or use alternative statin',
      },
      {
        drugs: ['lisinopril', 'spironolactone'],
        severity: 'medium' as const,
        description: 'Increased risk of hyperkalemia',
        recommendation: 'Monitor potassium levels regularly',
      },
      {
        drugs: ['metformin', 'contrast_media'],
        severity: 'contraindicated' as const,
        description: 'Risk of contrast-induced nephropathy and lactic acidosis',
        recommendation: 'Hold metformin before and after contrast administration',
      },
      {
        drugs: ['ssri', 'maoi'],
        severity: 'contraindicated' as const,
        description: 'Risk of serotonin syndrome',
        recommendation: 'Absolute contraindication - do not combine',
      },
    ];

    const drug1Name = drug1.name.toLowerCase();
    const drug2Name = drug2.name.toLowerCase();

    for (const interaction of knownInteractions) {
      const interactionDrugs = interaction.drugs.map(d => d.toLowerCase());

      // Check if both drugs are in this interaction
      if (interactionDrugs.some(d => drug1Name.includes(d)) &&
        interactionDrugs.some(d => drug2Name.includes(d))) {
        return {
          drugs: [drug1.name, drug2.name],
          severity: interaction.severity,
          description: interaction.description,
          recommendation: interaction.recommendation,
        };
      }

      // Check category-based interactions
      if (this.checkCategoryInteraction(drug1.category, drug2.category)) {
        return {
          drugs: [drug1.name, drug2.name],
          severity: 'medium' as const,
          description: `Potential interaction between ${drug1.category} and ${drug2.category}`,
          recommendation: 'Monitor for additive effects',
        };
      }
    }

    return null;
  }

  /**
   * Checks for category-based interactions
   */
  private checkCategoryInteraction(category1: string, category2: string): boolean {
    const interactingCategories = [
      ['anticoagulant', 'antiplatelet'],
      ['ace_inhibitor', 'potassium_sparing_diuretic'],
      ['beta_blocker', 'calcium_channel_blocker'],
      ['ssri', 'triptan'],
    ];

    return interactingCategories.some(pair =>
      (pair.includes(category1?.toLowerCase()) && pair.includes(category2?.toLowerCase()))
    );
  }

  /**
   * Checks contraindications based on patient/scenario context
   */
  private checkContraindications(drugs: any[], scenarioContext: any): string[] {
    const warnings: string[] = [];

    drugs.forEach(drug => {
      // Check against patient allergies
      if (scenarioContext.patientAllergies?.some((allergy: string) =>
        drug.name.toLowerCase().includes(allergy.toLowerCase()) ||
        drug.category?.toLowerCase().includes(allergy.toLowerCase())
      )) {
        warnings.push(`Allergy warning: Patient has known allergy to ${drug.name} or related drugs`);
      }

      // Check against medical condition contraindications
      if (scenarioContext.contraindications?.some((contra: string) =>
        drug.contraindications?.toLowerCase().includes(contra.toLowerCase())
      )) {
        warnings.push(`Contraindication: ${drug.name} is contraindicated in ${scenarioContext.medicalCondition}`);
      }

      // Condition-specific contraindications
      if (scenarioContext.medicalCondition === 'renal_failure' &&
        this.isNephrotoxic(drug.category)) {
        warnings.push(`Renal warning: ${drug.name} may require dose adjustment in renal impairment`);
      }

      if (scenarioContext.medicalCondition === 'liver_disease' &&
        this.isHepatotoxic(drug.category)) {
        warnings.push(`Hepatic warning: ${drug.name} may require dose adjustment in liver disease`);
      }
    });

    return warnings;
  }

  private isNephrotoxic(category: string): boolean {
    const nephrotoxicCategories = ['nsaid', 'aminoglycoside', 'contrast_media', 'vancomycin'];
    return nephrotoxicCategories.includes(category?.toLowerCase());
  }

  private isHepatotoxic(category: string): boolean {
    const hepatotoxicCategories = ['paracetamol', 'statins', 'antifungal', 'antitubercular'];
    return hepatotoxicCategories.includes(category?.toLowerCase());
  }

  /**
   * Gets clinical guidelines for a specific condition
   */
  async getClinicalGuidelines(condition: string): Promise<{
    condition: string;
    guidelines: Array<{
      organization: string;
      title: string;
      recommendations: string[];
      strength: 'strong' | 'moderate' | 'weak';
      lastUpdated: string;
    }>;
    references: string[];
  }> {
    // Mock clinical guidelines data (in real app, this would query a guidelines database)
    const guidelinesDatabase: { [key: string]: any } = {
      'myocardial_infarction': {
        guidelines: [
          {
            organization: 'American Heart Association',
            title: 'STEMI Management Guidelines',
            recommendations: [
              'Aspirin 162-325 mg chewed immediately',
              'PCI within 90 minutes of first medical contact',
              'Dual antiplatelet therapy for 12 months',
              'Statin therapy initiated before discharge',
            ],
            strength: 'strong',
            lastUpdated: '2023-11-01',
          },
          {
            organization: 'European Society of Cardiology',
            title: 'NSTEMI Management',
            recommendations: [
              'Risk stratification using GRACE score',
              'Early invasive strategy for high-risk patients',
              'DAPT duration based on bleeding vs ischemic risk',
            ],
            strength: 'strong',
            lastUpdated: '2023-09-15',
          },
        ],
        references: [
          'AHA/ACC Guideline for the Management of Patients With ST-Elevation Myocardial Infarction',
          'ESC Guidelines for the management of acute coronary syndromes',
        ],
      },
      'pneumonia': {
        guidelines: [
          {
            organization: 'Infectious Diseases Society of America',
            title: 'Community-Acquired Pneumonia',
            recommendations: [
              'CURB-65 score for severity assessment',
              'Empiric antibiotics based on local resistance patterns',
              'Switch from IV to oral therapy when clinically stable',
              'Pneumococcal and influenza vaccination',
            ],
            strength: 'strong',
            lastUpdated: '2023-07-20',
          },
        ],
        references: [
          'IDSA/ATS Guidelines for CAP in Adults',
        ],
      },
      'sepsis': {
        guidelines: [
          {
            organization: 'Surviving Sepsis Campaign',
            title: 'Sepsis and Septic Shock Management',
            recommendations: [
              'Measure lactate, obtain blood cultures before antibiotics',
              'Administer broad-spectrum antibiotics within 1 hour',
              '30 mL/kg crystalloid for hypotension or lactate ≥4 mmol/L',
              'Apply vasopressors for persistent hypotension',
            ],
            strength: 'strong',
            lastUpdated: '2023-03-10',
          },
        ],
        references: [
          'Surviving Sepsis Campaign: International Guidelines',
        ],
      },
    };

    const defaultGuidelines = {
      guidelines: [
        {
          organization: 'General Medical Practice',
          title: 'Standard Clinical Approach',
          recommendations: [
            'Comprehensive patient assessment',
            'Evidence-based treatment selection',
            'Regular monitoring and follow-up',
            'Patient education and shared decision-making',
          ],
          strength: 'moderate',
          lastUpdated: '2023-01-01',
        },
      ],
      references: ['Consult latest specialty-specific guidelines'],
    };

    return {
      condition,
      ...(guidelinesDatabase[condition] || defaultGuidelines),
    };
  }

  /**
   * Generates complication details based on type and severity
   */
  private generateComplication(complicationType: string, severity: number, session: any): any {
    const complicationTemplates: { [key: string]: (severity: number) => any } = {
      'arrhythmia': (sev) => ({
        type: 'arrhythmia',
        description: 'Cardiac rhythm disturbance',
        severity: sev,
        vitalSignChanges: {
          heartRate: 40 + Math.round(sev * 100), // 40-140 bpm based on severity
          bloodPressure: {
            systolic: 90 - Math.round(sev * 30), // 90-60 mmHg
            diastolic: 60 - Math.round(sev * 20), // 60-40 mmHg
          },
        },
        symptoms: ['palpitations', 'dizziness', 'shortness of breath'],
        requiredActions: ['cardiac_monitoring', 'medication_review'],
      }),

      'hypotension': (sev) => ({
        type: 'hypotension',
        description: 'Low blood pressure',
        severity: sev,
        vitalSignChanges: {
          bloodPressure: {
            systolic: 80 - Math.round(sev * 20), // 80-60 mmHg
            diastolic: 50 - Math.round(sev * 15), // 50-35 mmHg
          },
          heartRate: 100 + Math.round(sev * 40), // 100-140 bpm compensatory
        },
        symptoms: ['dizziness', 'weakness', 'confusion'],
        requiredActions: ['fluid_administration', 'vasopressors_consideration'],
      }),

      'respiratory_failure': (sev) => ({
        type: 'respiratory_failure',
        description: 'Inadequate oxygenation',
        severity: sev,
        vitalSignChanges: {
          respiratoryRate: 30 + Math.round(sev * 10), // 30-40 breaths/min
          oxygenSaturation: 95 - Math.round(sev * 25), // 95-70%
        },
        symptoms: ['severe shortness of breath', 'cyanosis', 'confusion'],
        requiredActions: ['oxygen_therapy', 'airway_management'],
      }),

      'sepsis': (sev) => ({
        type: 'sepsis',
        description: 'Systemic inflammatory response',
        severity: sev,
        vitalSignChanges: {
          heartRate: 110 + Math.round(sev * 30), // 110-140 bpm
          temperature: 38.5 + sev, // 38.5-39.5°C
          respiratoryRate: 22 + Math.round(sev * 8), // 22-30 breaths/min
        },
        symptoms: ['fever', 'tachycardia', 'tachypnea'],
        requiredActions: ['blood_cultures', 'broad_spectrum_antibiotics'],
      }),

      'allergic_reaction': (sev) => ({
        type: 'allergic_reaction',
        description: 'Medication allergy response',
        severity: sev,
        vitalSignChanges: {
          bloodPressure: {
            systolic: 100 - Math.round(sev * 40), // 100-60 mmHg
            diastolic: 60 - Math.round(sev * 25), // 60-35 mmHg
          },
          respiratoryRate: 20 + Math.round(sev * 10), // 20-30 breaths/min
        },
        symptoms: ['rash', 'swelling', 'wheezing'],
        requiredActions: ['stop_offending_medication', 'antihistamines', 'epinephrine_if_severe'],
      }),
    };

    const template = complicationTemplates[complicationType] || complicationTemplates['hypotension'];
    return template!(severity);
  }

  /**
   * Applies complication effects to patient state
   */
  private applyComplicationEffects(patientState: any, complication: any): any {
    return {
      ...patientState,
      symptoms: [...(patientState.symptoms || []), ...complication.symptoms],
      mentalStatus: this.updateMentalStatus(patientState.mentalStatus, complication),
      complications: [...(patientState.complications || []), complication.type],
      acuity: this.calculateAcuity(patientState.acuity, complication.severity),
    };
  }

  /**
   * Updates vital signs based on complication
   */
  private updateVitalSignsForComplication(vitalSigns: any, complication: any): any {
    return {
      ...vitalSigns,
      ...complication.vitalSignChanges,
      // Ensure pain level increases with complications
      painLevel: Math.min(10, (vitalSigns.painLevel || 0) + complication.severity * 3),
    };
  }

  /**
   * Calculates current disease progression stage
   */
  private calculateProgressionStage(session: any): string {
    const vitalSigns = session.latestVitalSigns as any;
    const patientState = session.currentPatientState as any;
    const complications = session.complicationsEncountered as string[];

    // Simple progression logic based on vital signs and complications
    if (complications.length > 2) {
      return 'severe';
    } else if (complications.length > 0) {
      return 'moderate';
    } else if (vitalSigns?.heartRate > 100 || vitalSigns?.bloodPressure?.systolic < 100) {
      return 'mild';
    } else {
      return 'stable';
    }
  }

  /**
   * Gets expected disease course for a scenario
   */
  private getExpectedCourse(scenario: any): any {
    // Define expected progression based on medical condition
    const progressionModels: { [key: string]: any } = {
      'myocardial_infarction': {
        stages: ['stable', 'mild', 'moderate', 'severe'],
        typicalTimeline: '2-6 hours',
        criticalPoints: ['arrhythmia', 'cardiogenic_shock', 'heart_failure'],
      },
      'pneumonia': {
        stages: ['mild', 'moderate', 'severe', 'respiratory_failure'],
        typicalTimeline: '24-72 hours',
        criticalPoints: ['hypoxia', 'sepsis', 'respiratory_failure'],
      },
      'sepsis': {
        stages: ['early', 'progressive', 'severe', 'refractory'],
        typicalTimeline: '6-24 hours',
        criticalPoints: ['hypotension', 'organ_dysfunction', 'shock'],
      },
    };

    return progressionModels[scenario.medicalCondition] || {
      stages: ['mild', 'moderate', 'severe'],
      typicalTimeline: '24-48 hours',
      criticalPoints: ['deterioration', 'complication'],
    };
  }

  /**
   * Calculates current risk of complications
   */
  private calculateComplicationsRisk(session: any): number {
    const progressionStage = this.calculateProgressionStage(session);
    const baseRisks: { [key: string]: number } = {
      'stable': 0.1,
      'mild': 0.3,
      'moderate': 0.6,
      'severe': 0.9,
    };

    let risk = baseRisks[progressionStage] || 0.5;

    // Adjust risk based on time elapsed
    const timeElapsed = session.totalVirtualTimeElapsed || 0;
    const timeFactor = Math.min(1, timeElapsed / 240); // 4 hours max
    risk += timeFactor * 0.2;

    // Adjust risk based on existing complications
    const existingComplications = session.complicationsEncountered?.length || 0;
    risk += existingComplications * 0.1;

    return Math.min(1, Math.max(0, risk));
  }
  // ========== PRIVATE METHODS ==========

  private initializeModels(): void {
    this.physiologyModel = new PhysiologyModel();
    this.complicationModel = new ComplicationProbabilityModel();
    this.medicationModel = new MedicationResponseModel();
    this.diseaseModels = new Map();

    // Preload common disease models
    this.loadCommonDiseaseModels();
  }

  private loadCommonDiseaseModels(): void {
    const commonConditions = [
      'myocardial_infarction',
      'pneumonia',
      'sepsis',
      'stroke',
      'diabetic_ketoacidosis',
    ];

    for (const condition of commonConditions) {
      this.diseaseModels!.set(condition, new DiseaseProgressionModel(condition));
    }
  }

  private async getDiseaseModel(condition: string): Promise<DiseaseProgressionModel> {
    if (!this.diseaseModels!.has(condition)) {
      // Load model for this condition
      this.diseaseModels!.set(
        condition,
        new DiseaseProgressionModel(condition)
      );
    }

    return this.diseaseModels!.get(condition)!;
  }

  private updateSymptoms(
    currentSymptoms: string[],
    progression: any,
    interventions: any[],
    physiologicalChanges: any,
  ): string[] {
    // // Complex symptom evolution logic based on disease progression and treatments
    // let symptoms = [...currentSymptoms];

    // // Remove symptoms that should be resolved by interventions
    // symptoms = symptoms.filter(symptom =>
    //   !this.shouldSymptomResolve(symptom, interventions, physiologicalChanges)
    // );

    // // Add new symptoms based on progression
    // const newSymptoms = this.getNewSymptoms(progression, physiologicalChanges);
    // symptoms.push(...newSymptoms);

    // // Update symptom severity
    // symptoms = this.updateSymptomSeverity(symptoms, progression, physiologicalChanges);

    // return [...new Set(symptoms)]; // Remove duplicates
    return currentSymptoms;
  }

  /**
  *   Updates mental status based on complication severity
  */
  // private updateMentalStatus(
  //   currentMentalStatus: string,
  //   physiologicalChanges: any,
  //   progression: any,
  // ): string {
  //   // Update mental status based on physiological changes
  //   if (physiologicalChanges.oxygenSaturation < 90) {
  //     return 'Confused';
  //   }

  //   if (physiologicalChanges.bloodPressure.systolic < 90) {
  //     return 'Lethargic';
  //   }

  //   // More complex neurological assessment would go here
  //   return currentMentalStatus;
  // }
  /**
 * Updates mental status based on complication severity
 */
  private updateMentalStatus(currentMentalStatus: string, physiologicalChanges: any): string {
    if (physiologicalChanges.oxygenSaturation < 90) {
      return 'Confused';
    }

    if (physiologicalChanges.bloodPressure?.systolic < 90) {
      return 'Lethargic';
    }

    return currentMentalStatus;
  }

  /**
   * Calculates patient acuity based on complications
   */
  private calculateAcuity(currentAcuity: number, complicationSeverity: number): number {
    return Math.min(1, (currentAcuity || 0) + complicationSeverity * 0.3);
  }

  /**
   * Gets available complication types for a scenario
   */
  async getAvailableComplications(sessionId: string): Promise<string[]> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    const conditionSpecificComplications: { [key: string]: string[] } = {
      'myocardial_infarction': ['arrhythmia', 'hypotension', 'heart_failure'],
      'pneumonia': ['respiratory_failure', 'sepsis', 'pleural_effusion'],
      'sepsis': ['hypotension', 'respiratory_failure', 'renal_failure'],
      'stroke': ['seizure', 'aspiration', 'increased_ICP'],
      'diabetic_ketoacidosis': ['hypotension', 'electrolyte_imbalance', 'cerebral_edema'],
    };

    return conditionSpecificComplications[session.scenario.medicalCondition] ||
      ['hypotension', 'arrhythmia', 'respiratory_failure'];
  }

  private validateInterventionRules(
    intervention: any,
    patientState: any,
    scenario: any,
  ): { isValid: boolean; risks: string[] } {
    const risks: string[] = [];

    // Rule-based validation for common medical errors
    switch (intervention.type) {
      case 'medication':
        if (this.hasKnownAllergy(intervention.details.drug, patientState.allergies)) {
          risks.push('Patient has known allergy to this medication');
        }

        if (this.isContraindicated(intervention.details.drug, patientState.conditions)) {
          risks.push('Medication is contraindicated for patient conditions');
        }
        break;

      case 'procedure':
        if (!this.hasInformedConsent(intervention, patientState.mentalStatus)) {
          risks.push('Procedure may require informed consent');
        }

        if (this.requiresSpecialTraining(intervention) && !this.hasRequiredTraining(intervention)) {
          risks.push('Procedure requires specialized training');
        }
        break;
    }

    return {
      isValid: risks.length === 0,
      risks,
    };
  }

  private hasKnownAllergy(drug: string, allergies: string[]): boolean {
    return allergies.some(allergy =>
      allergy.toLowerCase().includes(drug.toLowerCase())
    );
  }

  private isContraindicated(drug: string, conditions: string[]): boolean {
    // Simplified contraindication check
    const contraindications: { [key: string]: string[] } = {
      'metformin': ['renal_failure', 'liver_disease'],
      'warfarin': ['active_bleeding', 'hemophilia'],
      'ace_inhibitors': ['pregnancy', 'angioedema'],
    };

    return conditions.some(condition =>
      contraindications[drug]?.includes(condition)
    );
  }

  private calculateDiagnosticCompetency(session: any): any {
    // Complex logic to evaluate diagnostic skills
    const evidence: string[] = [];
    let score = 0;

    // Evaluate history taking
    const historyQuestions = session.conversations.filter((conv: any) =>
      conv.userMessage.toLowerCase().includes('history') ||
      conv.userMessage.toLowerCase().includes('symptom')
    ).length;

    if (historyQuestions >= 3) {
      score += 0.2;
      evidence.push('Comprehensive history taking');
    }

    // Evaluate test ordering appropriateness
    const appropriateTests = this.evaluateTestAppropriateness(session.labOrders);
    score += appropriateTests * 0.3;

    // Evaluate diagnosis accuracy and timing
    const diagnosticAccuracy = this.evaluateDiagnosticAccuracy(session);
    score += diagnosticAccuracy * 0.5;

    return {
      score: Math.min(1, score),
      feedback: this.generateDiagnosticFeedback(score, evidence),
      evidence,
    };
  }

  // Additional competency calculation methods would follow similar patterns...
  private calculateProceduralCompetency(session: any): any { /* ... */ }
  private calculateCommunicationCompetency(session: any): any { /* ... */ }
  private calculateProfessionalismCompetency(session: any): any { /* ... */ }
  private calculateCriticalThinkingCompetency(session: any): any { /* ... */ }

  private evaluateTestAppropriateness(labOrders: any[]): number {
    // Evaluate if ordered tests were appropriate for the clinical scenario
    let appropriateCount = 0;

    for (const order of labOrders) {
      if (this.isTestAppropriate(order.test, order.clinicalContext)) {
        appropriateCount++;
      }
    }

    return labOrders.length > 0 ? appropriateCount / labOrders.length : 1;
  }

  private isTestAppropriate(test: any, context: any): boolean {
    // Rule-based test appropriateness evaluation
    return true; // Simplified
  }

  private evaluateDiagnosticAccuracy(session: any): number {
    // Evaluate how accurately and quickly the correct diagnosis was reached
    return 0.8; // Simplified
  }

  private generateDiagnosticFeedback(score: number, evidence: string[]): string {
    if (score >= 0.9) return 'Excellent diagnostic reasoning with comprehensive evaluation';
    if (score >= 0.7) return 'Good diagnostic approach with appropriate investigations';
    if (score >= 0.5) return 'Adequate diagnostic process with some areas for improvement';
    return 'Needs significant improvement in diagnostic methodology';
  }

  private shouldSymptomResolve(symptom: string, interventions: any[], physiologicalChanges: any): boolean {
    // Determine if a symptom should resolve based on interventions and physiological changes
    return false; // Simplified
  }

  private getNewSymptoms(progression: any, physiologicalChanges: any): string[] {
    // Determine new symptoms based on disease progression
    return []; // Simplified
  }

  private updateSymptomSeverity(
    symptoms: string[],
    progression: any,
    interventions: any[],
    physiologicalChanges: any
  ): string[] {
    // Update symptom descriptions based on severity
    return symptoms; // Simplified
  }

  private generateRuleBasedDiagnosis(patientState: any, medicalHistory: any): any {
    // Rule-based diagnosis based on clinical presentation
    return {
      diagnoses: [],
      criticalConditions: [],
      recommendedTests: [],
    };
  }

  private mergeDiagnoses(llmDiagnoses: any[], ruleBasedDiagnoses: any[]): any[] {
    // Merge and rank diagnoses from both sources
    return [...llmDiagnoses, ...ruleBasedDiagnoses]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5); // Return top 5
  }

  private hasInformedConsent(intervention: any, mentalStatus: string): boolean {
    // Check if procedure requires and has informed consent
    return mentalStatus.includes('Alert');
  }

  private requiresSpecialTraining(intervention: any): boolean {
    // Check if procedure requires special training
    const advancedProcedures = ['intubation', 'central_line', 'chest_tube'];
    return advancedProcedures.includes(intervention.details.procedure);
  }

  private hasRequiredTraining(intervention: any): boolean {
    // Check if user has required training for procedure
    return true; // Simplified - would check user credentials
  }
}