// src/orders/dto/order-filters.dto.ts
import { 
  IsOptional, 
  IsEnum, 
  IsString,
  IsDateString 
} from 'class-validator';
import { OrderStatus, OrderPriority } from 'sharedtypes/dist';
import { Type } from 'class-transformer';

export class OrderFiltersDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsString()
  type?: 'medication' | 'lab' | 'procedure';

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // For drug names, test names, etc.
}