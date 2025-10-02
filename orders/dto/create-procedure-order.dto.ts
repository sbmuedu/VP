// src/orders/dto/create-procedure-order.dto.ts
import { 
  IsString, 
  IsEnum, 
  IsOptional, 
  IsDateString,
  IsObject,
  IsBoolean 
} from 'class-validator';
import { OrderPriority } from '@BackEnd/sharedTypes';

export class CreateProcedureOrderDto {
  @IsString()
  procedureId!: string;

  @IsEnum(OrderPriority)
  priority!: OrderPriority;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsDateString()
  scheduledTime?: string;

  @IsOptional()
  @IsObject()
  preProcedureRequirements?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  requiresConsent?: boolean;

  @IsOptional()
  @IsObject()
  anesthesiaPlan?: Record<string, any>;

  @IsOptional()
  @IsString()
  location?: string; // OR, bedside, etc.
}