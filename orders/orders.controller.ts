// src/orders/orders.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from 'sharedtypes/dist';
import { OrdersService } from './orders.service';
import {
  CreateMedicationOrderDto,
  CreateLabOrderDto,
  CreateProcedureOrderDto,
  UpdateOrderStatusDto,
  OrderFiltersDto,
} from './dto';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('sessions/:sessionId/medications')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Create a new medication order' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 201, description: 'Medication order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or drug interactions' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session or drug not found' })
  async createMedicationOrder(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() createOrderDto: CreateMedicationOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.createMedicationOrder(
      sessionId,
      createOrderDto,
      req.user.id,
      req.user.role,
    );
  }

  @Post('sessions/:sessionId/labs')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Create a new lab order' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 201, description: 'Lab order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session or test not found' })
  async createLabOrder(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() createOrderDto: CreateLabOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.createLabOrder(
      sessionId,
      createOrderDto,
      req.user.id,
      req.user.role,
    );
  }

  @Post('sessions/:sessionId/procedures')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Create a new procedure order' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 201, description: 'Procedure order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session or procedure not found' })
  async createProcedureOrder(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() createOrderDto: CreateProcedureOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.createProcedureOrder(
      sessionId,
      createOrderDto,
      req.user.id,
      req.user.role,
    );
  }

  @Patch('medications/:orderId/status')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Update medication order status' })
  @ApiParam({ name: 'orderId', description: 'Medication order ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateMedicationOrderStatus(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateOrderStatus(
      orderId,
      'medication',
      updateStatusDto,
      req.user.id,
      req.user.role,
    );
  }

  @Patch('labs/:orderId/status')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Update lab order status' })
  @ApiParam({ name: 'orderId', description: 'Lab order ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateLabOrderStatus(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateOrderStatus(
      orderId,
      'lab',
      updateStatusDto,
      req.user.id,
      req.user.role,
    );
  }

  @Patch('procedures/:orderId/status')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT)
  @ApiOperation({ summary: 'Update procedure order status' })
  @ApiParam({ name: 'orderId', description: 'Procedure order ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateProcedureOrderStatus(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateOrderStatus(
      orderId,
      'procedure',
      updateStatusDto,
      req.user.id,
      req.user.role,
    );
  }

  @Get('sessions/:sessionId')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all orders for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'type', required: false, enum: ['medication', 'lab', 'procedure'] })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSessionOrders(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() filters: OrderFiltersDto,
    @Request() req: any,
  ) {
    return this.ordersService.getSessionOrders(
      sessionId,
      req.user.id,
      req.user.role,
      filters,
    );
  }

  @Get('medications/:orderId')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get medication order details' })
  @ApiParam({ name: 'orderId', description: 'Medication order ID' })
  @ApiResponse({ status: 200, description: 'Order details retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getMedicationOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: any,
  ) {
    // Implementation would go here
    // This would call a method in OrdersService to get specific order details
  }

  @Get('labs/:orderId')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get lab order details' })
  @ApiParam({ name: 'orderId', description: 'Lab order ID' })
  @ApiResponse({ status: 200, description: 'Order details retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getLabOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: any,
  ) {
    // Implementation would go here
  }

  @Get('procedures/:orderId')
  @Roles(UserRole.STUDENT, UserRole.SUPERVISOR, UserRole.MEDICAL_EXPERT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get procedure order details' })
  @ApiParam({ name: 'orderId', description: 'Procedure order ID' })
  @ApiResponse({ status: 200, description: 'Order details retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getProcedureOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: any,
  ) {
    // Implementation would go here
  }
}