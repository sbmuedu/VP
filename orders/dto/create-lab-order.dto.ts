// src/orders/dto/create-lab-order.dto.ts
import { 
  IsString, 
  IsEnum, 
  IsOptional, 
  IsObject,
  IsArray 
} from 'class-validator';
import { OrderPriority } from '@BackEnd/sharedTypes';

export class CreateLabOrderDto {
  @IsString()
  testId!: string;

  @IsEnum(OrderPriority)
  priority: OrderPriority = OrderPriority.LOW;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  clinicalIndication?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificTests?: string[]; // For panel tests

  @IsOptional()
  @IsObject()
  specialInstructions?: Record<string, any>;
}