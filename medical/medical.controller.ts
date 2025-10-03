// src/medical/medical.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'sharedtypes/dist';
import { MedicalService } from './medical.service';
import {
  PhysiologyUpdateDto,
  InterventionEvaluationDto,
  MedicationResponsePredictionDto,
  DifferentialDiagnosisRequestDto,
  CompetencyEvaluationDto,
} from './dto';

@ApiTags('medical')
@Controller('medical')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) { }

  @Post('sessions/:sessionId/physiology-update')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Update patient physiology based on time and interventions' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Physiology updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async updatePatientPhysiology(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() physiologyUpdateDto: PhysiologyUpdateDto,
    @Request() req: any,
  ) {
    return this.medicalService.updatePatientPhysiology(
      sessionId,
      physiologyUpdateDto.timeElapsed,
      physiologyUpdateDto.interventions,
    );
  }

  @Post('interventions/evaluate')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Evaluate the appropriateness of a medical intervention' })
  @ApiResponse({ status: 200, description: 'Intervention evaluated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async evaluateIntervention(
    @Body() evaluationDto: InterventionEvaluationDto,
    @Request() req: any,
  ) {
    return this.medicalService.evaluateIntervention(
      evaluationDto.sessionId,
      {
        type: evaluationDto.type,
        details: evaluationDto.details,
        timing: new Date(evaluationDto.timing),
      },
      evaluationDto.patientState,
    );
  }

  @Post('medications/predict-response')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Predict patient response to medication' })
  @ApiResponse({ status: 200, description: 'Response predicted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Drug not found' })
  async predictMedicationResponse(
    @Body() predictionDto: MedicationResponsePredictionDto,
  ) {
    return this.medicalService.predictMedicationResponse(
      predictionDto.drugId,
      predictionDto.patientState,
      predictionDto.dosage,
      predictionDto.route,
    );
  }

  @Post('diagnosis/differential')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Generate differential diagnosis based on patient presentation' })
  @ApiResponse({ status: 200, description: 'Differential diagnosis generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async generateDifferentialDiagnosis(
    @Body() diagnosisRequestDto: DifferentialDiagnosisRequestDto,
  ) {
    return this.medicalService.generateDifferentialDiagnosis(
      diagnosisRequestDto.patientState,
      diagnosisRequestDto.medicalHistory,
      diagnosisRequestDto.scenarioContext,
    );
  }

  @Post('sessions/:sessionId/competency-scores')
  @Roles(UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Calculate competency scores for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Competency scores calculated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async calculateCompetencyScores(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: any,
  ) {
    return this.medicalService.calculateCompetencyScores(sessionId);
  }

  @Get('sessions/:sessionId/disease-progression')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Get current disease progression model for session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Disease progression retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getDiseaseProgression(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: any,
  ) {
    // This would return the current disease progression state and model
    const session = await this.medicalService.getSessionWithProgression(sessionId);
    // Calculate progression using private methods internally
    const progression = await this.medicalService.analyzeDiseaseProgression(session);
    return progression;
  }

  /**
   * SIMULATE COMPLICATION ENDPOINT
   * 
   * POST /medical/sessions/:sessionId/complications
   * 
   * Triggers a simulated medical complication for training purposes.
   * Used to test student emergency response skills.
   */
  //reza removed from old one
  // @Roles(UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  // @ApiOperation({ summary: 'Simulate a specific complication (for training purposes)' })
  // @ApiParam({ name: 'sessionId', description: 'Session ID' })
  // @ApiResponse({ status: 200, description: 'Complication simulated successfully' })
  // @ApiResponse({ status: 400, description: 'Invalid input or session not active' })
  // @ApiResponse({ status: 403, description: 'Access denied' })
  // @ApiResponse({ status: 404, description: 'Session not found' })
  @Post('sessions/:sessionId/complications')
  async simulateComplication(
    @Param('sessionId') sessionId: string,
    @Body() complicationData: any,
    @Request() req: any,
  ) {
    console.log(`Simulating complication in session ${sessionId}:`, complicationData);
    return this.medicalService.simulateComplication(
      sessionId,
      complicationData.type,
      complicationData.severity,
      complicationData.timing ? new Date(complicationData.timing) : undefined,
    );
  }
  /**
 * GET AVAILABLE COMPLICATIONS ENDPOINT
 * 
 * GET /medical/sessions/:sessionId/available-complications
 * 
 * Returns complications that can be simulated in the current session
 * based on the scenario context.
 */
  // reza removed from old one
  // @Roles(UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  // @ApiOperation({ summary: 'Get available complication types for a session' })
  // @ApiParam({ name: 'sessionId', description: 'Session ID' })
  // @ApiResponse({ status: 200, description: 'Available complications retrieved' })
  // @ApiResponse({ status: 403, description: 'Access denied' })
  // @ApiResponse({ status: 404, description: 'Session not found' })
  @Get('sessions/:sessionId/available-complications')
  async getAvailableComplications(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    return this.medicalService.getAvailableComplications(sessionId);
  }
  /**
   * CHECK DRUG INTERACTIONS ENDPOINT
   * 
   * GET /medical/drug-interactions
   * 
   * Checks for drug interactions either in session context or generally.
   * Supports both session-specific and general drug interaction checking.
   */
  // reza removed from old one
  // @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  // @ApiOperation({ summary: 'Check for drug interactions between multiple medications' })
  // @ApiResponse({ status: 200, description: 'Drug interactions checked successfully' })
  // @ApiResponse({ status: 400, description: 'Invalid drug IDs' })
  @Get('drug-interactions')
  async checkDrugInteractions(
    @Query('sessionId') sessionId?: string,
    @Query('drugIds') drugIds?: string[],
  ) {
    if (sessionId) {
      // Session-specific drug interaction check
      return this.medicalService.checkSessionDrugInteractions(sessionId, drugIds);
    } else if (drugIds && drugIds.length > 0) {
      // General drug interaction check
      return this.medicalService.checkGeneralDrugInteractions(drugIds);
    } else {
      throw new BadRequestException(
        'Either sessionId or drugIds query parameter is required'
      );
    }
  }
  
  /**
   * GET CLINICAL GUIDELINES ENDPOINT
   * 
   * GET /medical/guidelines/:condition
   * 
   * Returns evidence-based clinical guidelines for a medical condition.
   * Used for educational reference and decision support.
   */
  // reza removed from old one
  // @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  // @ApiOperation({ summary: 'Get clinical guidelines for a specific condition' })
  // @ApiParam({ name: 'condition', description: 'Medical condition' })
  // @ApiResponse({ status: 200, description: 'Guidelines retrieved successfully' })
  @Get('guidelines/:condition')
  async getClinicalGuidelines(
    @Param('condition') condition: string,
  ) {
    console.log(`Fetching clinical guidelines for condition: ${condition}`);
    return this.medicalService.getClinicalGuidelines(condition);
  }

  // Private helper methods for the controller
  private calculateProgressionStage(session: any): string {
    // Implementation would calculate current disease progression stage
    return 'moderate';
  }

  private getExpectedCourse(scenario: any): any {
    // Implementation would return expected disease course
    return {
      stages: ['mild', 'moderate', 'severe'],
      typicalTimeline: '24-48 hours',
      criticalPoints: ['hypotension', 'respiratory_failure'],
    };
  }

  private calculateComplicationsRisk(session: any): number {
    // Implementation would calculate current risk of complications
    return 0.3; // 30% risk
  }
}