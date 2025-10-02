import {
  Controller,
  Get,
  Param,
  Query,
  Put,
  Body,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
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
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'sharedtypes/dist';

import { Request as ExpressRequest } from 'express';

// Extend Express Request if you have custom properties
interface CustomRequest extends ExpressRequest {
  user?: {
    id: string;
    role: UserRole;
    email: string;
  };
}

/**
 * Users Controller
 * Handles HTTP requests for user management operations
 * Protected with JWT authentication and role-based authorization
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  /**
   * Get all users with pagination and filtering
   * Access: Admin, Supervisor, Medical Expert
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Get all users (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole, description: 'Filter by role' })
  @ApiQuery({ name: 'institutionId', required: false, type: String, description: 'Filter by institution' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('role') role?: UserRole,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.usersService.findAll(page, limit, role, institutionId);
  }

  /**
   * Get current user profile
   * Access: All authenticated users
   */
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@Request() req: CustomRequest) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.usersService.findOne(req.user.id);
  }

  /**
   * Get user by ID
   * Access: Admin, Supervisor (for their institution), or self
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string, @Request() req:CustomRequest) {
    // Authorization: users can view their own profile, admins/supervisors can view others
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }
    if (req.user.id !== id &&
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException('Insufficient permissions to view this user');
    }

    return this.usersService.findOne(id);
  }

  /**
   * Update user information
   * Access: Admin or self (with restrictions)
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update user information' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req:CustomRequest,
  ) {
    return this.usersService.update(id, updateUserDto, req.user);
  }

  /**
   * Deactivate user account
   * Access: Admin only
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate user account (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'User deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deactivate(@Param('id') id: string, @Request() req:CustomRequest) {
    await this.usersService.deactivate(id, req.user);
  }

  /**
   * Reactivate user account
   * Access: Admin only
   */
  @Put(':id/reactivate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reactivate user account (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'User reactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async reactivate(@Param('id') id: string, @Request() req:CustomRequest) {
    await this.usersService.reactivate(id, req.user);
  }

  /**
   * Get user statistics
   * Access: Admin, Supervisor, or self
   */
  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get user statistics and activity' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getStatistics(@Param('id') id: string, @Request() req:CustomRequest) {
    // Authorization: users can view their own stats, admins/supervisors can view others
    if(!req.user)
      throw new UnauthorizedException('User not authenticated');
    if (req.user.id !== id &&
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException('Insufficient permissions to view this user statistics');
    }

    return this.usersService.getUserStatistics(id);
  }

  /**
   * Get user sessions
   * Access: Admin, Supervisor, or self
   */
  @Get(':id/sessions')
  @ApiOperation({ summary: 'Get user sessions' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserSessions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req:CustomRequest,
  ) {
    // Authorization check
    if(!req.user)
      throw new UnauthorizedException('User not authenticated');
    if (req.user.id !== id &&
      req.user.role !== UserRole.ADMIN &&
      req.user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException('Insufficient permissions to view this user sessions');
    }

    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.usersService['prisma'].scenarioSession.findMany({
        where: { studentId: id },
        skip,
        take: limit,
        include: {
          scenario: {
            select: { id: true, title: true, difficulty: true, specialty: true }
          },
        },
        orderBy: { startTime: 'desc' },
      }),
      this.usersService['prisma'].scenarioSession.count({
        where: { studentId: id },
      }),
    ]);

    return {
      sessions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}