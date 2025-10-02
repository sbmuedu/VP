import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  UseGuards,
  HttpCode,
  HttpStatus 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth 
} from '@nestjs/swagger';
import { LLMService } from './llm.service';
import { GenerateResponseDto, AnalyzeConversationDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'sharedtypes/dist';

/**
 * LLM Controller
 * Handles AI-powered patient interactions and conversation analysis
 * Protected with JWT authentication and role-based authorization
 */
@ApiTags('LLM')
@Controller('llm')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LLMController {
  constructor(private readonly llmService: LLMService) {}

  /**
   * Generate patient response to a question
   * Access: All authenticated users
   */
  @Post('generate-response')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate patient response to a question' })
  @ApiResponse({ status: 200, description: 'Response generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or prohibited content' })
  @ApiResponse({ status: 500, description: 'LLM service unavailable' })
  async generateResponse(@Body() generateResponseDto: GenerateResponseDto) {
    return this.llmService.generatePatientResponse(
      generateResponseDto.prompt,
      generateResponseDto.context,
      {     //reza
        model: generateResponseDto.model || 'reza',
        temperature: generateResponseDto.temperature || 10,
        maxTokens: generateResponseDto.maxTokens || 500,
      }
    );
  }

  /**
   * Generate physical examination findings
   * Access: Students, Medical Experts, Supervisors, Admin
   */
  @Post('generate-examination-findings')
  @Roles(UserRole.STUDENT, UserRole.MEDICAL_EXPERT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate physical examination findings' })
  @ApiResponse({ status: 200, description: 'Findings generated successfully' })
  @ApiResponse({ status: 500, description: 'LLM service unavailable' })
  async generateExaminationFindings(
    @Body('technique') technique: string,
    @Body('context') context: any,
  ) {
    return this.llmService.generateExaminationFindings(technique, context);
  }

  /**
   * Analyze conversation for educational feedback
   * Access: Supervisors, Medical Experts, Admin
   */
  @Post('analyze-conversation')
  @Roles(UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Analyze conversation for educational feedback' })
  @ApiResponse({ status: 200, description: 'Analysis completed successfully' })
  @ApiResponse({ status: 500, description: 'LLM service unavailable' })
  async analyzeConversation(@Body() analyzeDto: AnalyzeConversationDto) {
    return this.llmService.analyzeConversation(analyzeDto);
  }

  /**
   * Generate differential diagnosis
   * Access: Medical Experts, Supervisors, Admin
   */
  @Post('generate-differential-diagnosis')
  @Roles(UserRole.MEDICAL_EXPERT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate differential diagnosis based on symptoms' })
  @ApiResponse({ status: 200, description: 'Diagnosis generated successfully' })
  @ApiResponse({ status: 500, description: 'LLM service unavailable' })
  async generateDifferentialDiagnosis(
    @Body('symptoms') symptoms: string[],
    @Body('context') context: any,
  ) {
    return this.llmService.generateDifferentialDiagnosis(symptoms, context);
  }

  /**
   * Check LLM service health
   * Access: All authenticated users
   */
  @Get('health')
  @ApiOperation({ summary: 'Check LLM service health and available models' })
  @ApiResponse({ status: 200, description: 'Health check completed' })
  async healthCheck() {
    return this.llmService.healthCheck();
  }

  /**
   * Switch active LLM model
   * Access: Admin only
   */
  @Post('switch-model')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Switch active LLM model (admin only)' })
  @ApiResponse({ status: 200, description: 'Model switched successfully' })
  @ApiResponse({ status: 400, description: 'Model not found' })
  async switchModel(@Body('model') model: string) {
    return this.llmService.switchModel(model);
  }
}
