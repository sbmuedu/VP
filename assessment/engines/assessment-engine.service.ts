// src/assessment/engines/assessment-engine.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompetencyCalculatorService } from './competency-calculator.service';
import { FeedbackGeneratorService } from './feedback-generator.service';
import { DebriefEngineService } from './debrief-engine.service';
import { BenchmarksService } from './benchmarks.service';

export interface AssessmentContext {
  sessionId: string;
  scenario: any;
  actions: any[];
  conversations: any[];
  orders: {
    medications: any[];
    labs: any[];
    procedures: any[];
  };
  events: any[];
  patientState: any;
  startTime: Date;
  endTime?: Date;
  virtualTimeElapsed: number;
  realTimeElapsed: number;
  lastAction?: any;
}

export interface CompetencyScores {
  diagnostic: { score: number; feedback: string; evidence: string[] };
  procedural: { score: number; feedback: string; evidence: string[] };
  communication: { score: number; feedback: string; evidence: string[] };
  professionalism: { score: number; feedback: string; evidence: string[] };
  criticalThinking: { score: number; feedback: string; evidence: string[] };
}

@Injectable()
export class AssessmentEngineService {
  private readonly logger = new Logger(AssessmentEngineService.name);

  constructor(
    private prisma: PrismaService,
    private competencyCalculator: CompetencyCalculatorService,
    private feedbackGenerator: FeedbackGeneratorService,
    private debriefEngine: DebriefEngineService,
    private benchmarksService: BenchmarksService,
  ) {}

  async generateRealTimeFeedback(context: AssessmentContext) {
    this.logger.log(`Generating real-time feedback for session ${context.sessionId}`);
    
    const competencyScores = await this.competencyCalculator.calculateCurrentCompetencies(
      context.sessionId,
      context
    );

    const feedback = await this.feedbackGenerator.generateFeedback(
      context,
      competencyScores
    );

    const criticalIssues = await this.feedbackGenerator.checkCriticalIssues(context);

    return {
      ...feedback,
      criticalIssues,
      timestamp: new Date(),
      confidence: this.calculateFeedbackConfidence(context, competencyScores),
    };
  }

  async calculateFinalAssessment(sessionId: string) {
    this.logger.log(`Calculating final assessment for session ${sessionId}`);

    const session = await this.getSessionWithFullData(sessionId);
    const context = this.buildAssessmentContext(session);

    const competencyScores = await this.competencyCalculator.calculateFinalCompetencies(
      sessionId,
      context
    );

    const timeEfficiency = this.calculateTimeEfficiency(session);
    const clinicalReasoning = await this.calculateClinicalReasoningScore(session);
    const patientSafety = this.calculatePatientSafetyScore(session);

    const overallScore = this.calculateOverallScore(
      competencyScores,
      timeEfficiency,
      clinicalReasoning,
      patientSafety
    );

    const benchmarkComparison = await this.benchmarksService.compareToBenchmarks(
      overallScore,
      session.scenario.difficultyLevel,
      session.assessmentType
    );

    const feedback = await this.feedbackGenerator.generateFinalFeedback(
      competencyScores,
      session.scenario.learningObjectives
    );

    return {
      competencyScores,
      overallScore,
      timeEfficiencyScore: timeEfficiency,
      clinicalReasoningScore: clinicalReasoning,
      patientSafetyScore: patientSafety,
      feedback,
      benchmarkComparison,
      detailedBreakdown: this.createDetailedBreakdown(session, competencyScores),
      timestamp: new Date(),
    };
  }

  async generateDebriefReport(sessionId: string) {
    this.logger.log(`Generating debrief report for session ${sessionId}`);
    const session = await this.getSessionWithFullData(sessionId);
    const assessment = await this.calculateFinalAssessment(sessionId);
    return this.debriefEngine.generateReport(session, assessment);
  }

  async generatePeerComparison(sessionId: string, userId: string) {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true },
    });

    if (!session) throw new Error(`Session ${sessionId} not found`);

    return this.benchmarksService.generatePeerComparison(
      sessionId,
      userId,
      session.scenarioId
    );
  }

  async trackCompetencyProgression(userId: string, timeframe: string = '6m') {
    const sessions = await this.prisma.scenarioSession.findMany({
      where: {
        studentId: userId,
        status: 'COMPLETED',
        endTime: { gte: this.getTimeframeDate(timeframe) },
      },
      include: {
        scenario: { select: { title: true, difficultyLevel: true, medicalCondition: true } },
      },
      orderBy: { endTime: 'asc' },
    });

    const progression = await Promise.all(
      sessions.map(async (session: { id: string; scenario: { title: any; }; endTime: any; }) => {  //reza  (session)=>
        const assessment = await this.calculateFinalAssessment(session.id);
        return {
          sessionId: session.id,
          scenario: session.scenario.title,
          date: session.endTime,
          scores: assessment.competencyScores,
          overallScore: assessment.overallScore,
        };
      })
    );

    return this.analyzeProgressionTrends(progression);
  }

  // Private helper methods
  private async getSessionWithFullData(sessionId: string) {
    return this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
      include: {
        scenario: { include: { learningObjectives: true, assessmentCriteria: true } },
        medicalActions: { 
          orderBy: { virtualTimeStarted: 'asc' },
          include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } }
        },
        conversations: { 
          orderBy: { timestamp: 'asc' },
          include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } }
        },
        medicationOrders: { include: { drug: true, prescribedBy: true, administeredBy: true } },
        labOrders: { include: { test: true, orderedBy: true, collectedBy: true } },
        procedureOrders: { include: { procedure: true, orderedBy: true, performedBy: true } },
        timeEvents: { orderBy: { virtualTimeScheduled: 'asc' } },
        student: { select: { id: true, firstName: true, lastName: true, email: true, experienceLevel: true } },
      },
    });
  }

  private buildAssessmentContext(session: any): AssessmentContext {
    return {
      sessionId: session.id,
      scenario: session.scenario,
      actions: session.medicalActions,
      conversations: session.conversations,
      orders: {
        medications: session.medicationOrders,
        labs: session.labOrders,
        procedures: session.procedureOrders,
      },
      events: session.timeEvents,
      patientState: session.currentPatientState,
      startTime: session.startTime,
      endTime: session.endTime,
      virtualTimeElapsed: session.totalVirtualTimeElapsed,
      realTimeElapsed: session.totalRealTimeElapsed,
    };
  }

  private calculateTimeEfficiency(session: any): number {
    const expectedDuration = session.scenario.expectedDuration || 3600;
    const actualDuration = session.totalVirtualTimeElapsed * 60;
    const efficiency = expectedDuration / actualDuration;
    return Math.min(1, efficiency);
  }

  private calculatePatientSafetyScore(session: any): number {
    let score = 1.0;
    // Implementation would analyze safety issues
    return Math.max(0, Math.min(1, score));
  }

  private calculateOverallScore(competencyScores: CompetencyScores, ...additionalScores: number[]): number {
    const weights = { diagnostic: 0.25, procedural: 0.15, communication: 0.15, professionalism: 0.1, criticalThinking: 0.2 };
    let totalScore = 0;
    let totalWeight = 0;

    for (const [competency, weight] of Object.entries(weights)) {
      totalScore += (competencyScores as any)[competency].score * weight;
      totalWeight += weight;
    }

    return totalScore / totalWeight;
  }

  private calculateFeedbackConfidence(context: AssessmentContext, scores: CompetencyScores): number {
    return 0.8; // Simplified implementation
  }

  private createDetailedBreakdown(session: any, scores: CompetencyScores): any {
    return { sessionId: session.id, analysis: 'Detailed breakdown would go here' };
  }

  private getTimeframeDate(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case '30d': return new Date(now.setDate(now.getDate() - 30));
      case '3m': return new Date(now.setMonth(now.getMonth() - 3));
      case '6m': return new Date(now.setMonth(now.getMonth() - 6));
      case '1y': return new Date(now.setFullYear(now.getFullYear() - 1));
      default: return new Date(now.setMonth(now.getMonth() - 6));
    }
  }

  private analyzeProgressionTrends(progression: any[]) {
    return { trends: [], improvementAreas: [], strengths: [] };
  }

  private async calculateClinicalReasoningScore(session: any): Promise<number> {
    return 0.8; // Simplified implementation
  }
}