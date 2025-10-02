// src/assessment/assessment.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentEngineService } from './engines/assessment-engine.service';
import { 
  RealTimeFeedbackRequestDto,
  DebriefConfigDto,
  PeerComparisonRequestDto
} from './dto';

@Injectable()
export class AssessmentService {
  constructor(
    private prisma: PrismaService,
    private assessmentEngine: AssessmentEngineService,
  ) {}

  /**
   * Generates real-time feedback during a session
   */
  async generateRealTimeFeedback(
    sessionId: string,
    feedbackRequest: RealTimeFeedbackRequestDto,
  ) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return this.assessmentEngine.generateRealTimeFeedback({
      sessionId,
      scenario: session.scenario,
      actions: [], // Would be populated from actual data
      conversations: [], // Would be populated from actual data
      orders: { medications: [], labs: [], procedures: [] }, // Would be populated
      events: [], // Would be populated
      patientState: feedbackRequest.patientState,
      startTime: session.startTime,
      virtualTimeElapsed: session.totalVirtualTimeElapsed,
      realTimeElapsed: session.totalRealTimeElapsed,
      lastAction: feedbackRequest.lastAction,
    });
  }

  /**
   * Calculates final comprehensive assessment
   */
  async calculateFinalAssessment(sessionId: string) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return this.assessmentEngine.calculateFinalAssessment(sessionId);
  }

  /**
   * Generates comprehensive debriefing report
   */
  async generateDebriefReport(sessionId: string, debriefConfig?: DebriefConfigDto) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return this.assessmentEngine.generateDebriefReport(sessionId);
  }

  /**
   * Compares performance against peer benchmarks
   */
  async getPeerComparison(sessionId: string, userId: string) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return this.assessmentEngine.generatePeerComparison(sessionId, userId);
  }

  /**
   * Gets performance trends for a user
   */
  async getPerformanceTrends(userId: string, timeframe: string = '6m') {
    return this.assessmentEngine.trackCompetencyProgression(userId, timeframe);
  }

  /**
   * Gets scenario benchmarks
   */
  async getScenarioBenchmarks(scenarioId: string, experienceLevel?: string) {
    // Implementation would fetch benchmark data for the scenario
    return {
      scenarioId,
      experienceLevel,
      averageScores: {
        overall: 0.75,
        diagnostic: 0.72,
        procedural: 0.68,
        communication: 0.80,
        criticalThinking: 0.71,
      },
      percentiles: {
        excellent: 0.90,
        good: 0.75,
        average: 0.60,
        needsImprovement: 0.50,
      },
    };
  }

  /**
   * Sets custom assessment criteria for a session
   */
  async setAssessmentCriteria(sessionId: string, criteria: any) {
    // Implementation would store custom assessment criteria
    return { sessionId, criteria, updated: new Date() };
  }

    /**
   * Gets session with learning objectives
   */
  async getSessionWithObjectives(sessionId: string) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: {
          select: {
            learningObjectives: true,
            title: true,
            difficultyLevel: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return session;
  }

  /**
   * Evaluates learning objectives achievement
   */
  async evaluateLearningObjectives(sessionId: string, learningObjectives: string[]) {
    const assessment = await this.calculateFinalAssessment(sessionId);
    
    const achievedObjectives = learningObjectives.map((objective, index) => {
      const competencyScores = Object.values(assessment.competencyScores);
      const averageScore = competencyScores.reduce((sum, score) => sum + score.score, 0) / competencyScores.length;
      
      return {
        objective,
        achieved: this.isObjectiveAchieved(objective, assessment, averageScore),
        score: this.calculateObjectiveScore(objective, assessment),
        evidence: this.collectObjectiveEvidence(objective, sessionId),
      };
    });

    return {
      achieved: achievedObjectives.filter(obj => obj.achieved).map(obj => obj.objective),
      detailedAnalysis: achievedObjectives,
      overallAchievementRate: achievedObjectives.filter(obj => obj.achieved).length / achievedObjectives.length,
    };
  }

  /**
   * Gets session with full data for assessment
   */
  async getSessionWithFullData(sessionId: string) {
    return this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: {
          include: {
            learningObjectives: true,
            assessmentCriteria: true,
          },
        },
        medicalActions: {
          orderBy: { virtualTimeStarted: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
        conversations: {
          orderBy: { timestamp: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
        medicationOrders: {
          include: {
            drug: true,
            prescribedBy: true,
            administeredBy: true,
          },
        },
        labOrders: {
          include: {
            test: true,
            orderedBy: true,
            collectedBy: true,
          },
        },
        procedureOrders: {
          include: {
            procedure: true,
            orderedBy: true,
            performedBy: true,
          },
        },
        timeEvents: {
          orderBy: { virtualTimeScheduled: 'asc' },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            experienceLevel: true,
          },
        },
      },
    });
  }

  // ========== PRIVATE HELPER METHODS ==========

  private isObjectiveAchieved(objective: string, assessment: any, averageScore: number): boolean {
    // Define objective achievement criteria
    const objectiveCriteria: { [key: string]: number } = {
      'diagnos': 0.7,  // Objectives containing 'diagnos' need 70% score
      'communicat': 0.8, // Communication objectives need 80% score
      'procedur': 0.65, // Procedure objectives need 65% score
      'critical': 0.75, // Critical thinking objectives need 75% score
    };

    const threshold = this.getObjectiveThreshold(objective, objectiveCriteria);
    return averageScore >= threshold;
  }

  private getObjectiveThreshold(objective: string, criteria: { [key: string]: number }): number {
    for (const [keyword, threshold] of Object.entries(criteria)) {
      if (objective.toLowerCase().includes(keyword)) {
        return threshold;
      }
    }
    return 0.7; // Default threshold
  }

  private calculateObjectiveScore(objective: string, assessment: any): number {
    // Map objectives to relevant competency scores
    const objectiveMapping: { [key: string]: keyof typeof assessment.competencyScores } = {
      'diagnos': 'diagnostic',
      'communicat': 'communication',
      'procedur': 'procedural',
      'critical': 'criticalThinking',
      'profession': 'professionalism',
    };

    for (const [keyword, competency] of Object.entries(objectiveMapping)) {
      if (objective.toLowerCase().includes(keyword)) {
        return assessment.competencyScores[competency].score;
      }
    }

    // Return overall score if no specific mapping
    return assessment.overallScore;
  }

  private async collectObjectiveEvidence(objective: string, sessionId: string): Promise<string[]> {
    const evidence: string[] = [];

    // Collect session data for evidence
    const session = await this.getSessionWithFullData(sessionId);
    if (!session) return evidence;

    // Add evidence based on objective type
    if (objective.toLowerCase().includes('diagnos')) {
      if (session.medicalActions.some((action:any) => action.actionType.includes('diagnostic'))) {
        evidence.push('Performed appropriate diagnostic procedures');
      }
      if (session.labOrders.length > 0) {
        evidence.push('Ordered relevant laboratory tests');
      }
    }

    if (objective.toLowerCase().includes('communicat')) {
      if (session.conversations.length > 5) {
        evidence.push('Engaged in comprehensive patient communication');
      }
    }

    if (objective.toLowerCase().includes('procedur')) {
      if (session.procedureOrders.length > 0) {
        evidence.push('Performed medical procedures appropriately');
      }
    }

    return evidence;
  }

}