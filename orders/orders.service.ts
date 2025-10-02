// src/orders/orders.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealTimeService } from '../real-time/real-time.service';
import {
  CreateMedicationOrderDto,
  CreateLabOrderDto,
  CreateProcedureOrderDto,
  UpdateOrderStatusDto
} from './dto';
import {
  OrderStatus,
  UserRole,
  MedicationOrder,
  LabOrder,
  ProcedureOrder
} from 'sharedtypes/dist';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private realTimeService: RealTimeService,
  ) { }

  /**
   * Creates a new medication order
   */
  async createMedicationOrder(
    sessionId: string,
    createOrderDto: CreateMedicationOrderDto,
    userId: string,
    userRole: UserRole,
  ): Promise<MedicationOrder> {
    const session = await this.verifySessionAccess(sessionId, userId, userRole);

    // Verify drug exists and is appropriate
    const drug = await this.prisma.drug.findUnique({
      where: { id: createOrderDto.drugId },
    });

    if (!drug) {
      throw new NotFoundException(`Drug with ID ${createOrderDto.drugId} not found`);
    }

    // Check for drug interactions
    const interactions = await this.checkDrugInteractions(
      sessionId,
      createOrderDto.drugId
    );

    if (interactions.hasCriticalInteractions) {
      throw new BadRequestException(
        `Critical drug interactions detected: ${interactions.interactions.join(', ')}`
      );
    }

    const order = await this.prisma.medicationOrder.create({
      data: {
        sessionId,
        drugId: createOrderDto.drugId,
        prescribedById: userId,
        dosage: createOrderDto.dosage,
        frequency: createOrderDto.frequency,
        route: createOrderDto.route,
        duration: createOrderDto.duration,
        instructions: createOrderDto.instructions,
        priority: createOrderDto.priority,
        status: OrderStatus.PENDING,
        scheduledTime: createOrderDto.scheduledTime,
        virtualTimeScheduled: session.currentVirtualTime,
      },
      include: {
        drug: true,
        prescribedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        administeredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Notify relevant users
    await this.realTimeService.notifyOrderCreated(
      sessionId,
      'medication',
      order,
      userId
    );

    // Schedule medication administration events
    await this.scheduleMedicationEvents(sessionId, order);

    return order as MedicationOrder;
  }

  /**
   * Creates a new lab order
   */
  async createLabOrder(
    sessionId: string,
    createOrderDto: CreateLabOrderDto,
    userId: string,
    userRole: UserRole,
  ): Promise<LabOrder> {
    const session = await this.verifySessionAccess(sessionId, userId, userRole);

    // Verify test exists
    const test = await this.prisma.labTest.findUnique({
      where: { id: createOrderDto.testId },
    });

    if (!test) {
      throw new NotFoundException(`Lab test with ID ${createOrderDto.testId} not found`);
    }

    const order = await this.prisma.labOrder.create({
      data: {
        sessionId,
        testId: createOrderDto.testId,
        orderedById: userId,
        priority: createOrderDto.priority,
        status: OrderStatus.PENDING,
        notes: createOrderDto.notes,
        virtualTimeOrdered: session.currentVirtualTime,
        expectedTurnaroundTime: test.typicalTurnaroundTime,
      },
      include: {
        test: true,
        orderedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        collectedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Schedule lab result event
    await this.scheduleLabResult(sessionId, order);

    // Notify users
    await this.realTimeService.notifyOrderCreated(
      sessionId,
      'lab',
      order,
      userId
    );

    return order as LabOrder;
  }

  /**
   * Creates a new procedure order
   */
  async createProcedureOrder(
    sessionId: string,
    createOrderDto: CreateProcedureOrderDto,
    userId: string,
    userRole: UserRole,
  ): Promise<ProcedureOrder> {
    const session = await this.verifySessionAccess(sessionId, userId, userRole);

    // Verify procedure exists
    const procedure = await this.prisma.medicalProcedure.findUnique({
      where: { id: createOrderDto.procedureId },
    });

    if (!procedure) {
      throw new NotFoundException(`Procedure with ID ${createOrderDto.procedureId} not found`);
    }

    const order = await this.prisma.procedureOrder.create({
      data: {
        sessionId,
        procedureId: createOrderDto.procedureId,
        orderedById: userId,
        priority: createOrderDto.priority,
        status: OrderStatus.PENDING,
        instructions: createOrderDto.instructions,
        scheduledTime: createOrderDto.scheduledTime,
        virtualTimeScheduled: session.currentVirtualTime,
        estimatedDuration: procedure.typicalDuration,
      },
      include: {
        procedure: true,
        orderedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        performedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Schedule procedure events
    await this.scheduleProcedureEvents(sessionId, order);

    // Notify users
    await this.realTimeService.notifyOrderCreated(
      sessionId,
      'procedure',
      order,
      userId
    );

    return order as ProcedureOrder;
  }

  /**
   * Updates order status
   */
  async updateOrderStatus(
    orderId: string,
    orderType: 'medication' | 'lab' | 'procedure',
    updateDto: UpdateOrderStatusDto,
    userId: string,
    userRole: UserRole,
  ): Promise<any> {
    let order;

    switch (orderType) {
      case 'medication':
        order = await this.prisma.medicationOrder.findUnique({
          where: { id: orderId },
          include: { session: true },
        });
        break;
      case 'lab':
        order = await this.prisma.labOrder.findUnique({
          where: { id: orderId },
          include: { session: true },
        });
        break;
      case 'procedure':
        order = await this.prisma.procedureOrder.findUnique({
          where: { id: orderId },
          include: { session: true },
        });
        break;
    }

    if (!order) {
      throw new NotFoundException(`${orderType} order with ID ${orderId} not found`);
    }

    // Verify access
    await this.verifySessionAccess(order.sessionId, userId, userRole);

    let updatedOrder;

    switch (orderType) {
      case 'medication':
        updatedOrder = await this.prisma.medicationOrder.update({
          where: { id: orderId },
          data: {
            status: updateDto.status,
            administeredById: updateDto.status === OrderStatus.COMPLETED ? userId : null,
            administeredAt: updateDto.status === OrderStatus.COMPLETED ? new Date() : null,
            notes: updateDto.notes,
          },
          include: {
            drug: true,
            prescribedBy: true,
            administeredBy: true,
          },
        });
        break;

      case 'lab':
        updatedOrder = await this.prisma.labOrder.update({
          where: { id: orderId },
          data: {
            status: updateDto.status,
            collectedById: updateDto.status === OrderStatus.COMPLETED ? userId : null,
            collectedAt: updateDto.status === OrderStatus.COMPLETED ? new Date() : null,
            notes: updateDto.notes,
          },
          include: {
            test: true,
            orderedBy: true,
            collectedBy: true,
          },
        });
        break;

      case 'procedure':
        updatedOrder = await this.prisma.procedureOrder.update({
          where: { id: orderId },
          data: {
            status: updateDto.status,
            performedById: updateDto.status === OrderStatus.COMPLETED ? userId : null,
            performedAt: updateDto.status === OrderStatus.COMPLETED ? new Date() : null,
            notes: updateDto.notes,
            findings: updateDto.findings,
          },
          include: {
            procedure: true,
            orderedBy: true,
            performedBy: true,
          },
        });
        break;
    }

    // Notify about status change
    await this.realTimeService.notifyOrderStatusChanged(
      order.sessionId,
      orderType,
      updatedOrder,
      userId
    );

    // Process completion effects
    if (updateDto.status === OrderStatus.COMPLETED) {
      await this.processOrderCompletion(order.sessionId, orderType, updatedOrder);
    }

    return updatedOrder;
  }

  /**
   * Gets orders for a session
   */
  async getSessionOrders(
    sessionId: string,
    userId: string,
    userRole: UserRole,
    filters?: { type?: string; status?: OrderStatus },
  ): Promise<{
    medications: MedicationOrder[];
    labs: LabOrder[];
    procedures: ProcedureOrder[];
  }> {
    await this.verifySessionAccess(sessionId, userId, userRole);

    const [medications, labs, procedures] = await Promise.all([
      this.prisma.medicationOrder.findMany({
        where: {
          sessionId,
          ...(filters?.status && { status: filters.status }),
        },
        include: {
          drug: true,
          prescribedBy: true,
          administeredBy: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.labOrder.findMany({
        where: {
          sessionId,
          ...(filters?.status && { status: filters.status }),
        },
        include: {
          test: true,
          orderedBy: true,
          collectedBy: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.procedureOrder.findMany({
        where: {
          sessionId,
          ...(filters?.status && { status: filters.status }),
        },
        include: {
          procedure: true,
          orderedBy: true,
          performedBy: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      medications: medications as MedicationOrder[],
      labs: labs as LabOrder[],
      procedures: procedures as ProcedureOrder[],
    };
  }

  // ========== PRIVATE METHODS ==========

  private async verifySessionAccess(
    sessionId: string,
    userId: string,
    userRole: UserRole
  ): Promise<any> {
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    // Check access permissions (similar to SessionsService)
    if (session.studentId !== userId && session.supervisorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Access denied to this session');
    }

    return session;
  }

  private async checkDrugInteractions(
    sessionId: string,
    drugId: string,
  ): Promise<{ hasCriticalInteractions: boolean; interactions: string[] }> {
    // Get current active medications
    const activeMeds = await this.prisma.medicationOrder.findMany({
      where: {
        sessionId,
        status: OrderStatus.COMPLETED,
        virtualTimeScheduled: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      include: { drug: true },
    });

    // Check interactions (simplified - in real implementation, use drug interaction database)
    const interactions: string[] = [];

    for (const med of activeMeds) {
      // This would query a drug interaction database
      const interaction = await this.checkSpecificInteraction(med.drugId, drugId);
      if (interaction) {
        interactions.push(interaction);
      }
    }

    return {
      hasCriticalInteractions: interactions.length > 0,
      interactions,
    };
  }

  private async checkSpecificInteraction(
    drug1Id: string,
    drug2Id: string,
  ): Promise<string | null> {
    // Simplified interaction check
    // In real implementation, this would query a comprehensive drug interaction database
    const knownInteractions = [
      { drugs: ['warfarin', 'aspirin'], interaction: 'Increased bleeding risk' },
      { drugs: ['simvastatin', 'clarithromycin'], interaction: 'Increased myopathy risk' },
    ];

    const drug1 = await this.prisma.drug.findUnique({ where: { id: drug1Id } });
    const drug2 = await this.prisma.drug.findUnique({ where: { id: drug2Id } });

    if (!drug1 || !drug2) return null;

    for (const known of knownInteractions) {
      if (known.drugs.includes(drug1.name.toLowerCase()) &&
        known.drugs.includes(drug2.name.toLowerCase())) {
        return known.interaction;
      }
    }

    return null;
  }

  private async scheduleMedicationEvents(
    sessionId: string,
    order: any, // Use any type or create proper interface
    // order: MedicationOrder,
  ): Promise<void> {
    // Schedule administration reminder
    await this.prisma.timeEvent.create({
      data: {
        sessionId,
        eventType: 'medication_administration_due',
        eventData: {
          orderId: order.id,
          drug: order.drug.name,
          dosage: order.dosage,
        },
        virtualTimeScheduled: order.scheduledTime || new Date(),
        requiresAttention: true,
        isComplication: false,
      },
    });

    // Schedule effect evaluation (e.g., 30 minutes after administration)
    const effectTime = new Date(order.virtualTimeScheduled.getTime() + 30 * 60000);
    await this.prisma.timeEvent.create({
      data: {
        sessionId,
        eventType: 'medication_effect_evaluation',
        eventData: {
          orderId: order.id,
          drug: order.drug.name,
        },
        virtualTimeScheduled: effectTime,
        requiresAttention: false,
        isComplication: false,
      },
    });
  }

  private async scheduleLabResult(
    sessionId: string,
    order: any,  //LabOrder,
  ): Promise<void> {
    const turnaroundTime = order.expectedTurnaroundTime || 60; // 60 minutes default
    const resultTime = new Date((order.createdAt || new Date()).getTime() + turnaroundTime * 60000);
    // const resultTime = new Date(order.virtualTimeOrdered.getTime() + order.expectedTurnaroundTime * 60000);

    await this.prisma.timeEvent.create({
      data: {
        sessionId,
        eventType: 'lab_result_ready',
        eventData: {
          orderId: order.id,
          test: order.test.name,
          // Mock result data - in real implementation, this would be generated based on patient state
          result: this.generateMockLabResult(order.test.name),
        },
        virtualTimeScheduled: resultTime,
        requiresAttention: true,
        isComplication: false,
      },
    });
  }

  private async scheduleProcedureEvents(
    sessionId: string,
    order: any, //ProcedureOrder,
  ): Promise<void> {
    // Schedule procedure start reminder
    await this.prisma.timeEvent.create({
      data: {
        sessionId,
        eventType: 'procedure_scheduled',
        eventData: {
          orderId: order.id,
          procedure: order.procedure.name,
        },
        // virtualTimeScheduled: order.virtualTimeScheduled,
        virtualTimeScheduled: order.scheduledTime || new Date(),
        requiresAttention: true,
        isComplication: false,
      },
    });

    // Schedule outcome evaluation
    const estimatedDuration = order.estimatedDuration || 30; // 30 minutes default
    const outcomeTime = new Date((order.scheduledTime || new Date()).getTime() + estimatedDuration * 60000);
    // const outcomeTime = new Date(order.virtualTimeScheduled.getTime() + order.estimatedDuration * 60000);
    await this.prisma.timeEvent.create({
      data: {
        sessionId,
        eventType: 'procedure_outcome_evaluation',
        eventData: {
          orderId: order.id,
          procedure: order.procedure.name,
        },
        virtualTimeScheduled: outcomeTime,
        requiresAttention: false,
        isComplication: false,
      },
    });
  }

  private generateMockLabResult(testName: string): any {
    // Simplified mock lab result generation
    // In real implementation, this would be based on patient's condition and disease progression
    const mockResults: { [key: string]: any } = {
      'CBC': {
        wbc: '7.2 x10^3/μL',
        hgb: '13.8 g/dL',
        hct: '41.2%',
        platelets: '245 x10^3/μL',
      },
      'Basic Metabolic Panel': {
        sodium: '139 mmol/L',
        potassium: '4.1 mmol/L',
        chloride: '102 mmol/L',
        glucose: '98 mg/dL',
      },
      'Liver Function Tests': {
        alt: '28 U/L',
        ast: '32 U/L',
        alp: '85 U/L',
        bilirubin: '0.8 mg/dL',
      },
    };

    return mockResults[testName] || { result: 'Within normal limits' };
  }

  private async processOrderCompletion(
    sessionId: string,
    orderType: string,
    order: any,
  ): Promise<void> {
    // Update patient state based on completed order
    const session = await this.prisma.scenarioSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return;

    // This would trigger updates to patient state based on the completed order
    // For example, medication effects, procedure outcomes, lab result interpretations
    await this.realTimeService.notifyPatientStateUpdate(sessionId, session.currentPatientState);
  }
}