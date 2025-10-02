// src/assessment/assessment.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'sharedtypes/dist';
import { AssessmentService } from './assessment.service';
import {
  RealTimeFeedbackRequestDto,
  AssessmentCriteriaDto,
  DebriefConfigDto,
  PeerComparisonRequestDto,
  FeedbackResponseDto,
} from './dto';

@ApiTags('assessment')
@Controller('assessment')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post('sessions/:sessionId/real-time-feedback')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Generate real-time feedback during a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Feedback generated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async generateRealTimeFeedback(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() feedbackRequest: RealTimeFeedbackRequestDto,
    @Request() req: any,
  ) {
    return this.assessmentService.generateRealTimeFeedback(
      sessionId,
      {
        lastAction: feedbackRequest.lastAction,
        patientState: feedbackRequest.patientState,
        timeElapsed: feedbackRequest.timeElapsed,
        sessionId
      },
    );
  }

  @Post('sessions/:sessionId/final-assessment')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Calculate final assessment for completed session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Final assessment calculated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async calculateFinalAssessment(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: any,
  ) {
    return this.assessmentService.calculateFinalAssessment(sessionId);
  }

  @Post('sessions/:sessionId/debrief-report')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate comprehensive debriefing report' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Debrief report generated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async generateDebriefReport(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() debriefConfig: DebriefConfigDto,
    @Request() req: any,
  ) {
    return this.assessmentService.generateDebriefReport(sessionId);
  }

  @Get('sessions/:sessionId/peer-comparison')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Compare performance against peer benchmarks' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Peer comparison generated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getPeerComparison(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() comparisonRequest: PeerComparisonRequestDto,
    @Request() req: any,
  ) {
    return this.assessmentService.getPeerComparison(
      sessionId,
      req.user.id,
    );
  }

  @Get('sessions/:sessionId/competency-breakdown')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get detailed competency breakdown for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Competency breakdown retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getCompetencyBreakdown(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: any,
  ) {
    const assessment = await this.assessmentService.calculateFinalAssessment(sessionId);
    return {
      competencies: assessment.competencyScores,
      detailedBreakdown: assessment.detailedBreakdown,
      strengths: this.identifyStrengths(assessment.competencyScores),
      areasForImprovement: this.identifyImprovementAreas(assessment.competencyScores),
    };
  }

  @Get('sessions/:sessionId/critical-moments')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get critical moments and decision points from session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Critical moments retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getCriticalMoments(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: any,
  ) {
    const debrief = await this.assessmentService.generateDebriefReport(sessionId);
    return {
      criticalMoments: debrief.criticalMoments,
      keyDecisions: debrief.keyDecisions,
      timeline: this.constructTimeline(debrief),
    };
  }

  @Post('sessions/:sessionId/assessment-criteria')
  @Roles(UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Set custom assessment criteria for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Assessment criteria updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async setAssessmentCriteria(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() assessmentCriteria: AssessmentCriteriaDto,
    @Request() req: any,
  ) {
    return this.assessmentService.setAssessmentCriteria(
      sessionId,
      assessmentCriteria,
    );
  }

  @Get('sessions/:sessionId/learning-objectives-progress')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Get progress towards learning objectives' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Learning objectives progress retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getLearningObjectivesProgress(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.assessmentService.getSessionWithObjectives(sessionId);
    return {
      objectives: session.scenario.learningObjectives,
      achieved: await this.assessmentService.evaluateLearningObjectives(
        sessionId,
        session.scenario.learningObjectives
      ),
      progress: this.calculateObjectiveProgress(session),
      recommendations: this.generateObjectiveRecommendations(session),
    };
  }

  @Get('benchmarks/scenario/:scenarioId')
  @Roles(UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get performance benchmarks for a specific scenario' })
  @ApiParam({ name: 'scenarioId', description: 'Scenario ID' })
  @ApiResponse({ status: 200, description: 'Benchmarks retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async getScenarioBenchmarks(
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Query('experienceLevel') experienceLevel?: string,
  ) {
    return this.assessmentService.getScenarioBenchmarks(
      scenarioId,
      experienceLevel,
    );
  }

  @Get('users/:userId/performance-trends')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get performance trends for a user over time' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'timeframe', required: false, description: 'Timeframe for trends (e.g., 30d, 6m, 1y)' })
  @ApiResponse({ status: 200, description: 'Performance trends retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getPerformanceTrends(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('timeframe') timeframe: string = '6m',
    @Request() req: any,
  ) {
    // Check if user has access to view this user's data
    if (req.user.id !== userId && req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException('Access denied to view this user\'s performance data');
    }

    return this.assessmentService.getPerformanceTrends(userId, timeframe);
  }

  // Private helper methods
  private identifyStrengths(competencyScores: any): string[] {
    const strengths: string[] = [];
    for (const [competency, data] of Object.entries(competencyScores)) {
      if ((data as any).score >= 0.8) {
        strengths.push(competency);
      }
    }
    return strengths;
  }

  private identifyImprovementAreas(competencyScores: any): string[] {
    const areas: string[] = [];
    for (const [competency, data] of Object.entries(competencyScores)) {
      if ((data as any).score < 0.6) {
        areas.push(competency);
      }
    }
    return areas;
  }

  private constructTimeline(debrief: any): any[] {
    // Implementation would construct a detailed timeline from debrief data
    return debrief.criticalMoments.map((moment: any) => ({
      time: moment.time,
      event: moment.event,
      response: moment.response,
      effectiveness: moment.effectiveness,
    }));
  }

  private calculateObjectiveProgress(session: any): any {
    // Implementation would calculate progress towards each learning objective
    return session.scenario.learningObjectives.map((objective: string) => ({
      objective,
      progress: 0.75, // Example progress
      evidence: [], // Evidence supporting progress
    }));
  }

  private generateObjectiveRecommendations(session: any): string[] {
    // Implementation would generate recommendations for achieving objectives
    return [
      'Practice differential diagnosis for similar cases',
      'Review communication techniques for patient education',
      'Study pharmacological management guidelines',
    ];
  }
}