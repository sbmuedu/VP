import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScenarioDto, UpdateScenarioDto, ScenarioFiltersDto } from './dto';
import {
  UserRole,
  MedicalScenario,
  ScenarioDifficulty,
  CompetencyWeights
} from 'sharedtypes/dist';

/**
 * Scenarios Service
 * Handles medical scenario management including CRUD, validation, and access control
 */
@Injectable()
export class ScenariosService {
  constructor(private prisma: PrismaService) { }

  /**
   * Creates a new medical scenario
   * @param createScenarioDto - Scenario data
   * @param userId - ID of user creating the scenario
   * @returns Created scenario
   * @throws ConflictException if scenario with same title exists
   */
  async create(
    createScenarioDto: CreateScenarioDto,
    userId: string
  ): Promise<MedicalScenario> {
    // Check for duplicate title
    const existingScenario = await this.prisma.medicalScenario.findFirst({
      where: {
        title: createScenarioDto.title,
        createdBy: userId,
      },
    });

    if (existingScenario) {
      throw new ConflictException('Scenario with this title already exists');
    }

    // Validate competency weights sum to 1
    this.validateCompetencyWeights(createScenarioDto.competencyWeights);

    const scenario = await this.prisma.medicalScenario.create({
      data: {
        ...createScenarioDto,
        createdBy: userId,
        // Set default values if not provided
        competencyWeights: createScenarioDto.competencyWeights as any, // Cast to any for Json
        // timeAccelerationRate: createScenarioDto.timeAccelerationRate || 60,
        // requiresTimePressure: createScenarioDto.requiresTimePressure || false,
        // version: 1.0,
        // isActive: true,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        institution: true,
      },
    });

    return scenario; // as MedicalScenario;
  }

  /**
   * Retrieves all scenarios with filtering and pagination
   * @param filters - Filter criteria
   * @param userId - Current user ID for access control
   * @param userRole - Current user role for access control
   * @returns Paginated list of scenarios
   */
  async findAll(
    filters: ScenarioFiltersDto,
    userId: string,
    userRole: UserRole,
  ): Promise<{ scenarios: MedicalScenario[]; total: number; page: number; totalPages: number }> {
    const { page, limit, difficulty, specialty, search, tag } = filters;
    const skip = (page! - 1) * limit!;

    // Build where clause based on filters and user permissions
    const where = this.buildWhereClause(difficulty, specialty, search, tag, userId, userRole);

    const [scenarios, total] = await Promise.all([
      this.prisma.medicalScenario.findMany({
        where,
        skip,
        take: limit || 10,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          institution: true,
          _count: {
            select: {
              sessions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.medicalScenario.count({ where }),
    ]);

    return {
      scenarios: scenarios as MedicalScenario[],
      total,
      page: page ?? 1,
      totalPages: Math.ceil(total / (limit ?? 4)),
    };
  }

  /**
   * Finds a scenario by ID with proper access control
   * @param id - Scenario ID
   * @param userId - Current user ID
   * @param userRole - Current user role
   * @returns Scenario details
   * @throws NotFoundException if scenario not found
   * @throws ForbiddenException if user cannot access scenario
   */
  async findOne(
    id: string,
    userId: string,
    userRole: UserRole
  ): Promise<MedicalScenario> {
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            specialization: true,
          },
        },
        institution: true,
        validatedByExpert: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        sessions: {
          take: 5,
          orderBy: { startTime: 'desc' },
          select: {
            id: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            startTime: true,
            overallScore: true,
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Check access permissions
    this.checkScenarioAccess(scenario, userId, userRole);

    return scenario; // as MedicalScenario;
  }

  /**
   * Updates an existing scenario
   * @param id - Scenario ID
   * @param updateScenarioDto - Update data
   * @param userId - Current user ID
   * @param userRole - Current user role
   * @returns Updated scenario
   * @throws NotFoundException if scenario not found
   * @throws ForbiddenException if user cannot update scenario
   */
  async update(
    id: string,
    updateScenarioDto: UpdateScenarioDto,
    userId: string,
    userRole: UserRole,
  ): Promise<MedicalScenario> {
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: { id },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Check update permissions
    this.checkUpdatePermissions(scenario, userId, userRole);

    // Validate competency weights if provided
    if (updateScenarioDto.competencyWeights) {
      this.validateCompetencyWeights(updateScenarioDto.competencyWeights);
    }

    // Check for duplicate title if title is being updated
    if (updateScenarioDto.title && updateScenarioDto.title !== scenario.title) {
      const existingScenario = await this.prisma.medicalScenario.findFirst({
        where: {
          title: updateScenarioDto.title,
          createdBy: userId,
          id: { not: id },
        },
      });

      if (existingScenario) {
        throw new ConflictException('Scenario with this title already exists');
      }
    }

    const updatedScenario = await this.prisma.medicalScenario.update({
      where: { id },
      data: {
        ...updateScenarioDto,
        version: scenario.version + 0.1, // Increment version
        validatedByExpertId: null, // Reset validation if content changed
        validationDate: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        institution: true,
      },
    });

    return updatedScenario as MedicalScenario;
  }

  /**
   * Deletes a scenario (soft delete by setting isActive to false)
   * @param id - Scenario ID
   * @param userId - Current user ID
   * @param userRole - Current user role
   * @throws NotFoundException if scenario not found
   * @throws ForbiddenException if user cannot delete scenario
   */
  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: { id },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Check delete permissions
    this.checkUpdatePermissions(scenario, userId, userRole);

    // Check if scenario has active sessions
    const activeSessions = await this.prisma.scenarioSession.count({
      where: {
        scenarioId: id,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
    });

    if (activeSessions > 0) {
      throw new ConflictException('Cannot delete scenario with active sessions');
    }

    await this.prisma.medicalScenario.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Validates a scenario by a medical expert
   * @param id - Scenario ID
   * @param expertId - Medical expert ID
   * @param notes - Validation notes
   * @returns Validated scenario
   * @throws NotFoundException if scenario not found
   * @throws ForbiddenException if user is not a medical expert
   */
  async validateScenario(
    id: string,
    expertId: string,
    notes?: string
  ): Promise<MedicalScenario> {
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: { id },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    // Verify expert role (this should be enforced at controller level)
    const expert = await this.prisma.user.findUnique({
      where: { id: expertId, role: UserRole.MEDICAL_EXPERT },
    });

    if (!expert) {
      throw new ForbiddenException('Only medical experts can validate scenarios');
    }

    const validatedScenario = await this.prisma.medicalScenario.update({
      where: { id },
      data: {
        validatedByExpertId: expertId,
        validationDate: new Date(),
        validationNotes: notes,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        validatedByExpert: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        institution: true,
      },
    });

    return validatedScenario as MedicalScenario;
  }

  /**
   * Gets scenario statistics
   * @param id - Scenario ID
   * @returns Scenario usage statistics
   * @throws NotFoundException if scenario not found
   */
  async getScenarioStatistics(id: string) {
    const scenario = await this.prisma.medicalScenario.findUnique({
      where: { id },
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${id} not found`);
    }

    const [
      sessionCount,
      completionCount,
      averageScore,
      averageDuration,
      difficultyBreakdown,
    ] = await Promise.all([
      this.prisma.scenarioSession.count({
        where: { scenarioId: id },
      }),
      this.prisma.scenarioSession.count({
        where: {
          scenarioId: id,
          status: 'COMPLETED',
        },
      }),
      this.prisma.scenarioSession.aggregate({
        where: {
          scenarioId: id,
          overallScore: { not: null },
        },
        _avg: { overallScore: true },
      }),
      this.prisma.scenarioSession.aggregate({
        where: {
          scenarioId: id,
          status: 'COMPLETED',
        },
        _avg: { totalVirtualTimeElapsed: true },
      }),
      this.prisma.scenarioSession.groupBy({
        by: ['status'],
        where: { scenarioId: id },
        _count: { id: true },
      }),
    ]);

    return {
      sessionCount,
      completionCount,
      completionRate: sessionCount > 0 ? (completionCount / sessionCount) * 100 : 0,
      averageScore: averageScore._avg.overallScore || 0,
      averageDuration: averageDuration._avg.totalVirtualTimeElapsed || 0,
      statusBreakdown: difficultyBreakdown,
      createdAt: scenario.createdAt,
      lastSession: await this.getLastSessionDate(id),
    };
  }

  /**
   * Builds WHERE clause for scenario filtering
   */
  private buildWhereClause(
    difficulty?: ScenarioDifficulty,
    specialty?: string,
    search?: string,
    tag?: string,
    userId?: string,
    userRole?: UserRole,
  ) {
    const where: any = { isActive: true };

    // Basic filters
    if (difficulty) where.difficulty = difficulty;
    if (specialty) where.specialty = { contains: specialty, mode: 'insensitive' };
    if (tag) where.tags = { has: tag };

    // Search in title and description
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { chiefComplaint: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Access control: students only see validated scenarios
    if (userRole === UserRole.STUDENT || userRole === UserRole.NURSE) {
      where.validatedByExpertId = { not: null };
    }

    // Institutional access control (simplified)
    if (userRole === UserRole.SUPERVISOR) {
      // Supervisors see scenarios from their institution
      where.OR = [
        { validatedByExpertId: { not: null } }, // Validated scenarios
        { createdBy: userId }, // Their own scenarios
      ];
    }

    return where;
  }

  /**
   * Checks if user can access a specific scenario
   */
  private checkScenarioAccess(scenario: any, userId: string, userRole: UserRole): void {
    // Admin can access everything
    if (userRole === UserRole.ADMIN) return;

    // Medical experts can access everything
    if (userRole === UserRole.MEDICAL_EXPERT) return;

    // Creator can access their own scenarios
    if (scenario.createdBy === userId) return;

    // Students and nurses can only access validated scenarios
    if ((userRole === UserRole.STUDENT || userRole === UserRole.NURSE) &&
      !scenario.validatedByExpertId) {
      throw new ForbiddenException('Access denied: scenario not validated');
    }

    // Supervisors can access validated scenarios and scenarios from their institution
    if (userRole === UserRole.SUPERVISOR) {
      if (!scenario.validatedByExpertId && scenario.institutionId) {
        // Check if scenario belongs to supervisor's institution
        // This would require additional institution checks in a real implementation
      }
    }
  }

  /**
   * Checks if user can update a scenario
   */
  private checkUpdatePermissions(scenario: any, userId: string, userRole: UserRole): void {
    // Admin can update everything
    if (userRole === UserRole.ADMIN) return;

    // Medical experts can update scenarios they validated or their own
    if (userRole === UserRole.MEDICAL_EXPERT) {
      if (scenario.validatedByExpertId === userId || scenario.createdBy === userId) {
        return;
      }
      throw new ForbiddenException('Can only update scenarios you created or validated');
    }

    // Creators can update their own scenarios
    if (scenario.createdBy === userId) return;

    throw new ForbiddenException('Insufficient permissions to update this scenario');
  }

  /**
   * Validates that competency weights sum to 1
   */
  private validateCompetencyWeights(weights: CompetencyWeights): void {
    const sum = Object.values(weights).reduce((a: number, b: number) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      throw new BadRequestException('Competency weights must sum to 1');
    }
  }
  // private validateCompetencyWeights(weights: { [key: string]: number }): void {
  //   const sum = Object.values(weights).reduce((a: number, b: number) => a + b, 0);
  //   if (Math.abs(sum - 1) > 0.001) {
  //     throw new BadRequestException('Competency weights must sum to 1');
  //   }
  // }


  /**
   * Gets the date of the last session for a scenario
   */
  private async getLastSessionDate(scenarioId: string): Promise<Date | null> {
    const lastSession = await this.prisma.scenarioSession.findFirst({
      where: { scenarioId },
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    });

    return lastSession?.startTime || null;
  }
}