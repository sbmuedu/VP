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
  ) {}

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

  async generateDifferentialDiagnosis(sessionId: string) {
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

  private extractSymptomsFromSession(session: any): string[] {
    const symptoms: string[] = [];
    
    if (session.scenario?.chiefComplaint) {
      symptoms.push(session.scenario.chiefComplaint);
    }
    
    // Extract additional symptoms from patient state or history
    if (session.currentPatientState) {
      const patientState = typeof session.currentPatientState === 'string' 
        ? JSON.parse(session.currentPatientState)
        : session.currentPatientState;
      
      if (patientState.symptoms) {
        symptoms.push(...patientState.symptoms);
      }
    }
    
    return symptoms;
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
}