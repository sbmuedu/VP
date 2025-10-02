import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException,
  ConflictException 
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from 'sharedtypes/dist';

/**
 * Users Service
 * Handles user management operations including CRUD and role-based access
 */
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves all users with pagination and filtering
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of users per page (default: 10)
   * @param role - Filter by user role
   * @param institutionId - Filter by institution
   * @returns Paginated list of users
   */
  async findAll(
    page = 1,
    limit = 10,
    role?: UserRole,
    institutionId?: string,
  ): Promise<{ users: Omit<User, 'password'>[]; total: number }> {
    const skip = (page - 1) * limit;
    
    const where = {
      ...(role && { role }),
      ...(institutionId && { institutionId }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          specialization: true,
          licenseNumber: true,
          institutionId: true,
          institution: true,
          authProvider: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          // Exclude password
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users as Omit<User, 'password'>[],
      total,
    };
  }

  /**
   * Finds a user by their ID
   * @param id - User ID
   * @returns User object without password
   * @throws NotFoundException if user not found
   */
  async findOne(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { 
        institution: true,
        createdScenarios: {
          select: { id: true, title: true, createdAt: true }
        },
        studentSessions: {
          select: { id: true, scenario: { select: { title: true } }, startTime: true }
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Finds a user by their email address
   * @param email - User email
   * @returns User object without password
   * @throws NotFoundException if user not found
   */
  async findByEmail(email: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { institution: true },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Updates a user's information
   * @param id - User ID to update
   * @param updateUserDto - Data to update
   * @param currentUser - Current authenticated user (for authorization)
   * @returns Updated user object
   * @throws NotFoundException if user not found
   * @throws ForbiddenException if unauthorized to update
   * @throws ConflictException if email already exists
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser: any,
  ): Promise<Omit<User, 'password'>> {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Authorization check
    this.checkUpdatePermissions(currentUser, existingUser, updateUserDto);

    // Check for email conflict if email is being updated
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (emailExists) {
        throw new ConflictException('Email already exists');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      include: { institution: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Deactivates a user account (soft delete)
   * @param id - User ID to deactivate
   * @param currentUser - Current authenticated user
   * @throws NotFoundException if user not found
   * @throws ForbiddenException if unauthorized to deactivate
   */
  async deactivate(id: string, currentUser: any): Promise<void> {
    // Prevent self-deactivation
    if (id === currentUser.id) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Only admins can deactivate other users
    if (currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Insufficient permissions to deactivate user');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Reactivates a deactivated user account
   * @param id - User ID to reactivate
   * @param currentUser - Current authenticated user
   * @throws NotFoundException if user not found
   * @throws ForbiddenException if unauthorized to reactivate
   */
  async reactivate(id: string, currentUser: any): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Only admins can reactivate users
    if (currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Insufficient permissions to reactivate user');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Gets statistics for a user (sessions, scenarios, performance)
   * @param id - User ID
   * @returns User statistics
   * @throws NotFoundException if user not found
   */
  async getUserStatistics(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const [sessionCount, createdScenariosCount, avgScore] = await Promise.all([
      this.prisma.scenarioSession.count({
        where: { studentId: id },
      }),
      this.prisma.medicalScenario.count({
        where: { createdBy: id },
      }),
      this.prisma.scenarioSession.aggregate({
        where: { 
          studentId: id,
          overallScore: { not: null }
        },
        _avg: { overallScore: true },
      }),
    ]);

    return {
      sessionCount,
      createdScenariosCount,
      averageScore: avgScore._avg.overallScore || 0,
      lastLogin: user.lastLoginAt,
      accountCreated: user.createdAt,
    };
  }

  /**
   * Checks if current user has permission to update the target user
   * @param currentUser - Current authenticated user
   * @param targetUser - User being updated
   * @param updateData - Data being updated
   * @throws ForbiddenException if unauthorized
   */
  private checkUpdatePermissions(
    currentUser: any,
    targetUser: any,
    updateData: UpdateUserDto,
  ): void {
    const isSelf = currentUser.id === targetUser.id;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    // Users can update their own information (except role)
    if (isSelf) {
      if (updateData.role && updateData.role !== currentUser.role) {
        throw new ForbiddenException('Cannot change your own role');
      }
      return;
    }

    // Only admins can update other users
    if (!isAdmin) {
      throw new ForbiddenException('Insufficient permissions to update other users');
    }

    // Prevent role escalation (admins can't make others admins unless they are admin)
    if (updateData.role === UserRole.ADMIN && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot assign admin role without admin privileges');
    }
  }
}