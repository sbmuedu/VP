import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto } from './dto';
import { User, UserRole, LoginResponse } from '@BackEnd/sharedTypes';

/**
 * Authentication Service
 * Handles user registration, login, JWT token generation and validation
 */
@Injectable()
export class AuthService {
  private readonly saltRounds = 12;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Validates user credentials and returns user object if valid
   * @param email - User email address
   * @param password - User password
   * @returns User object without password if validation succeeds
   * @throws UnauthorizedException if credentials are invalid
   */
  async validateUser(email: string, password: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { institution: true },
    });

    if (user && await bcrypt.compare(password, user.password)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...result } = user;
      return result;
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  /**
   * Registers a new user in the system
   * @param registerDto - Registration data
   * @returns Login response with user and tokens
   * @throws ConflictException if email already exists
   */
  async register(registerDto: RegisterDto): Promise<LoginResponse> {
    const { email, password, institutionCode, ...userData } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Find institution if code provided
    let institution = null;
    if (institutionCode) {
      institution = await this.prisma.institution.findFirst({
        where: { domain: institutionCode },
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, this.saltRounds);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        ...userData,
        email,
        password: hashedPassword,
        institutionId: institution?.id,
      },
      include: { institution: true },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      user: userWithoutPassword,
      ...tokens,
    };
  }

  /**
   * Authenticates user and generates JWT tokens
   * @param loginDto - Login credentials
   * @returns Login response with user and tokens
   */
  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user,
      ...tokens,
    };
  }

  /**
   * Generates new access and refresh tokens
   * @param userId - User ID
   * @param email - User email
   * @param role - User role
   * @returns Object containing access token and refresh token
   */
  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload = { 
      sub: userId, 
      email, 
      role,
      iss: 'virtual-patient-platform',
      aud: 'virtual-patient-users',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get('jwt.expiration')!,
        secret: this.configService.get('jwt.secret')!,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: '30d', // Refresh token valid for 30 days
        secret: this.configService.get('jwt.secret')! + '-refresh',
      }),
    ]);

    // Store refresh token in database (optional enhancement)
    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        // In a production system, you might want to store hashed refresh tokens
        lastLoginAt: new Date(),
      },
    });

    return {
      token: accessToken,
      refreshToken,
    };
  }

  /**
   * Refreshes an expired access token using a valid refresh token
   * @param refreshToken - Valid refresh token
   * @returns New access token
   * @throws UnauthorizedException if refresh token is invalid
   */
  async refreshToken(refreshToken: string): Promise<{ token: string }> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('jwt.secret') + '-refresh',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newToken = await this.jwtService.signAsync(
        { 
          sub: user.id, 
          email: user.email, 
          role: user.role,
          iss: 'virtual-patient-platform',
          aud: 'virtual-patient-users',
        },
        {
          expiresIn: this.configService.get('jwt.expiration')!,
          secret: this.configService.get('jwt.secret')!,
        },
      );

      return { token: newToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Changes user password
   * @param userId - User ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @throws UnauthorizedException if current password is incorrect
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
  }
}