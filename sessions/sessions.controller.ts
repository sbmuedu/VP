import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  Param, 
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth, 
  ApiParam 
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { 
  StartSessionDto, 
  FastForwardDto, 
  PatientQuestionDto, 
  PerformActionDto 
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { type CustomRequest, UserRole } from 'sharedtypes/dist';

/**
 * Sessions Controller
 * Handles scenario session management, time control, and patient interactions
 * Protected with JWT authentication and role-based authorization
 */
@ApiTags('Sessions')
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * Start a new scenario session
   * Access: Students, Medical Experts, Supervisors, Admin
   */
  @Post('scenarios/:scenarioId/start')
  @Roles(UserRole.STUDENT, UserRole.MEDICAL_EXPERT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Start a new scenario session' })
  @ApiParam({ name: 'scenarioId', description: 'Scenario ID' })
  @ApiResponse({ status: 201, description: 'Session started successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied to scenario' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  @ApiResponse({ status: 409, description: 'Active session already exists' })
  async startSession(
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body() startSessionDto: StartSessionDto,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.startSession(scenarioId, req.user!.id, startSessionDto);
  }

  /**
   * Get session by ID
   * Access: Session participants and authorized roles
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.getSession(id, req.user!.id, req.user!.role);
  }

  /**
   * Fast-forward time in a session
   * Access: Session student or supervisor
   */
  @Put(':id/fast-forward')
  @ApiOperation({ summary: 'Fast-forward time in session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Time fast-forwarded successfully' })
  @ApiResponse({ status: 400, description: 'Cannot fast-forward at this time' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async fastForwardTime(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() fastForwardDto: FastForwardDto,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.fastForwardTime(id, fastForwardDto, req.user!.id);
  }

  /**
   * Ask patient a question
   * Access: Session student or supervisor
   */
  @Post(':id/ask-patient')
  @ApiOperation({ summary: 'Ask patient a question' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Question asked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async askPatientQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() patientQuestionDto: PatientQuestionDto,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.askPatientQuestion(id, patientQuestionDto, req.user!.id);
  }

  /**
   * Perform medical action
   * Access: Session student or supervisor
   */
  @Post(':id/perform-action')
  @ApiOperation({ summary: 'Perform medical action' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Action performed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid action' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async performAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() performActionDto: PerformActionDto,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.performAction(id, performActionDto, req.user!.id);
  }

  /**
   * Pause session
   * Access: Session student only
   */
  @Put(':id/pause')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Pause session (student only)' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session paused successfully' })
  @ApiResponse({ status: 400, description: 'Session not active' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async pauseSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.pauseSession(id, req.user!.id);
  }

  /**
   * Resume session
   * Access: Session student only
   */
  @Put(':id/resume')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Resume session (student only)' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session resumed successfully' })
  @ApiResponse({ status: 400, description: 'Session not paused' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async resumeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.resumeSession(id, req.user!.id);
  }

  /**
   * Complete session
   * Access: Session student only
   */
  @Put(':id/complete')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Complete session (student only)' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session completed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async completeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req:CustomRequest,
  ) {
    return this.sessionsService.completeSession(id, req.user!.id);
  }

  /**
   * Get active sessions for current user
   * Access: All authenticated users
   */
  @Get('user/active')
  @ApiOperation({ summary: 'Get active sessions for current user' })
  @ApiResponse({ status: 200, description: 'Active sessions retrieved successfully' })
  async getActiveSessions(@Request() req:CustomRequest) {
    // This would call a method to get active sessions for the user
    // Implementation would be added to the service
    const sessions = await this.sessionsService['prisma'].scenarioSession.findMany({
      where: {
        OR: [
          { studentId: req.user!.id, status: { in: ['ACTIVE', 'PAUSED'] } },
          { supervisorId: req.user!.id, status: { in: ['ACTIVE', 'PAUSED'] } },
        ],
      },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            specialty: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    return { sessions };
  }

  /**
   * Get session history for current user
   * Access: All authenticated users
   */
  @Get('user/history')
  @ApiOperation({ summary: 'Get session history for current user' })
  @ApiResponse({ status: 200, description: 'Session history retrieved successfully' })
  async getSessionHistory(@Request() req:CustomRequest) {
    const sessions = await this.sessionsService['prisma'].scenarioSession.findMany({
      where: {
        OR: [
          { studentId: req.user!.id },
          { supervisorId: req.user!.id },
        ],
        status: 'COMPLETED',
      },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            specialty: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 20, // Last 20 sessions
    });

    return { sessions };
  }
}