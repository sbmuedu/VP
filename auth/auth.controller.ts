import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './decorators/roles.decorator';
import * as dist from 'sharedtypes/dist';

/**
 * Authentication Controller
 * Handles HTTP requests for user authentication and account management
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * User registration endpoint
   * Creates a new user account in the system
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ 
    status: 201, 
    description: 'User successfully registered' 
  })
  @ApiResponse({ 
    status: 409, 
    description: 'User with this email already exists' 
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * User login endpoint
   * Authenticates user and returns JWT tokens
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ 
    status: 200, 
    description: 'User successfully logged in' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Invalid credentials' 
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Token refresh endpoint
   * Generates new access token using refresh token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ 
    status: 200, 
    description: 'Token successfully refreshed' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Invalid refresh token' 
  })
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  /**
   * Get current user profile
   * Returns authenticated user's information
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ 
    status: 200, 
    description: 'User profile retrieved successfully' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  getProfile(@Request() req:dist.CustomRequest) {
    return req.user;
  }

  /**
   * Change password endpoint
   * Allows authenticated users to change their password
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Roles(dist.UserRole.STUDENT, dist.UserRole.NURSE, dist.UserRole.SUPERVISOR, dist.UserRole.MEDICAL_EXPERT, dist.UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ 
    status: 200, 
    description: 'Password changed successfully' 
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Current password is incorrect' 
  })
  async changePassword(
    @Request() req:dist.CustomRequest,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.changePassword(req.user!.id, currentPassword, newPassword);
  }
}