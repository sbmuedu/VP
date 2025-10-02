import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe, 
  ForbiddenException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth, 
  ApiQuery,
  ApiParam 
} from '@nestjs/swagger';
import { ScenariosService } from './scenarios.service';
import { CreateScenarioDto, UpdateScenarioDto, ScenarioFiltersDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { type CustomRequest, UserRole } from 'sharedtypes/dist';

/**
 * Scenarios Controller
 * Handles HTTP requests for medical scenario management
 * Protected with JWT authentication and role-based authorization
 */
@ApiTags('Scenarios')
@Controller('scenarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  /**
   * Create a new medical scenario
   * Access: Medical Expert, Supervisor, Admin
   */
  @Post()
  @Roles(UserRole.MEDICAL_EXPERT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new medical scenario' })
  @ApiResponse({ status: 201, description: 'Scenario created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Scenario with this title already exists' })
  async create(@Body() createScenarioDto: CreateScenarioDto, @Request() req:CustomRequest) {
    return this.scenariosService.create(createScenarioDto, req.user!.id);
  }

  /**
   * Get all scenarios with filtering and pagination
   * Access: All authenticated users (with content restrictions)
   */
  @Get()
  @ApiOperation({ summary: 'Get all scenarios (with filtering)' })
  @ApiQuery({ name: 'difficulty', required: false, enum: UserRole })
  @ApiQuery({ name: 'specialty', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'tag', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Scenarios retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() filters: ScenarioFiltersDto, @Request() req:CustomRequest) {
    return this.scenariosService.findAll(filters, req.user!.id, req.user!.role);
  }

  /**
   * Get scenario by ID
   * Access: All authenticated users (with content restrictions)
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get scenario by ID' })
  @ApiParam({ name: 'id', description: 'Scenario ID' })
  @ApiResponse({ status: 200, description: 'Scenario retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string, 
    @Request() req:CustomRequest
  ) {
    return this.scenariosService.findOne(id, req.user!.id, req.user!.role);
  }

  /**
   * Update scenario
   * Access: Scenario creator, Medical Expert (for validation), Admin
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update scenario' })
  @ApiParam({ name: 'id', description: 'Scenario ID' })
  @ApiResponse({ status: 200, description: 'Scenario updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  @ApiResponse({ status: 409, description: 'Scenario with this title already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScenarioDto: UpdateScenarioDto,
    @Request() req:CustomRequest,
  ) {
    return this.scenariosService.update(id, updateScenarioDto, req.user!.id, req.user!.role);
  }

  /**
   * Delete scenario (soft delete)
   * Access: Scenario creator, Admin
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete scenario' })
  @ApiParam({ name: 'id', description: 'Scenario ID' })
  @ApiResponse({ status: 204, description: 'Scenario deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  @ApiResponse({ status: 409, description: 'Scenario has active sessions' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    await this.scenariosService.remove(id, req.user!.id, req.user!.role);
  }

  /**
   * Validate scenario (medical expert only)
   * Access: Medical Expert, Admin
   */
  @Post(':id/validate')
  @Roles(UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Validate scenario (medical expert only)' })
  @ApiParam({ name: 'id', description: 'Scenario ID' })
  @ApiResponse({ status: 200, description: 'Scenario validated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async validateScenario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @Request() req:CustomRequest,
  ) {
    return this.scenariosService.validateScenario(id, req.user!.id, notes);
  }

  /**
   * Get scenario statistics
   * Access: Scenario creator, Medical Expert, Supervisor, Admin
   */
  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get scenario statistics' })
  @ApiParam({ name: 'id', description: 'Scenario ID' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async getStatistics(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    // Additional authorization check for statistics
    const scenario = await this.scenariosService.findOne(id, req.user!.id, req.user!.role);
    
    // Only allow access to creator, medical experts, supervisors, and admins
    if (req.user!.role !== UserRole.ADMIN && 
        req.user!.role !== UserRole.MEDICAL_EXPERT && 
        req.user!.role !== UserRole.SUPERVISOR &&
        scenario.createdBy !== req.user!.id) {
      throw new ForbiddenException('Insufficient permissions to view scenario statistics');
    }

    return this.scenariosService.getScenarioStatistics(id);
  }

  /**
   * Duplicate scenario
   * Access: Medical Expert, Supervisor, Admin
   */
  @Post(':id/duplicate')
  @Roles(UserRole.MEDICAL_EXPERT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duplicate scenario' })
  @ApiParam({ name: 'id', description: 'Scenario ID' })
  @ApiResponse({ status: 201, description: 'Scenario duplicated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async duplicateScenario(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    const originalScenario = await this.scenariosService.findOne(id, req.user!.id, req.user!.role);
    
    const duplicateData: CreateScenarioDto = {
      title: `${originalScenario.title} (Copy)`,
      description: originalScenario.description,
      difficulty: originalScenario.difficulty,
      specialty: originalScenario.specialty,
      estimatedDuration: originalScenario.estimatedDuration,
      timeAccelerationRate: originalScenario.timeAccelerationRate,
      maxFastForwardDuration: originalScenario.maxFastForwardDuration ?? 30, //reza
      requiresTimePressure: originalScenario.requiresTimePressure,
      competencyWeights: originalScenario.competencyWeights as any,
      learningObjectives: originalScenario.learningObjectives,
      chiefComplaint: originalScenario.chiefComplaint,
      historyOfPresentIllness: originalScenario.historyOfPresentIllness,
      pastMedicalHistory: originalScenario.pastMedicalHistory,
      medications: originalScenario.medications,
      allergies: originalScenario.allergies,
      initialVitalSigns: originalScenario.initialVitalSigns as any,
      initialEmotionalState: originalScenario.initialEmotionalState,
      physiologyModel: originalScenario.physiologyModel,
      complicationTriggers: originalScenario.complicationTriggers ?? [], //reza
      naturalProgression: originalScenario.naturalProgression,
      scheduledEvents: originalScenario.scheduledEvents ?? [], //reza
      branchingPaths: originalScenario.branchingPaths ?? [], //reza
    //   tags: originalScenario.tags ?? '',  //reza
    };

    return this.scenariosService.create(duplicateData, req.user!.id);
  }
}