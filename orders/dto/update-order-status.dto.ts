// src/orders/dto/update-order-status.dto.ts
import { 
  IsEnum, 
  IsOptional, 
  IsString, 
  IsObject,
  IsArray 
} from 'class-validator';
import { OrderStatus } from '@BackEnd/sharedTypes';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus = OrderStatus.IN_PROGRESS;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  findings?: Record<string, any>; // For procedure results

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  complications?: string[];

  @IsOptional()
  @IsObject()
  results?: Record<string, any>; // For lab results

  @IsOptional()
  @IsString()
  administeredBy?: string; // For medication administration

  @IsOptional()
  @IsString()
  performedBy?: string; // For procedures
}