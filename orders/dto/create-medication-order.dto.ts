// src/orders/dto/create-medication-order.dto.ts
import { 
  IsString, 
  IsNumber, 
  IsEnum, 
  IsOptional, 
  IsDateString,
  ValidateNested,
  IsObject
} from 'class-validator';
import { Type } from 'class-transformer';
import { 
   MedicationPriority, 
  AdministrationRoute, 
  Frequency 
} from '@BackEnd/sharedTypes';

export class MedicationDosageDto {
  @IsNumber()
  amount!: number;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsString()
  form?: string; // tablet, liquid, injection, etc.
}

export class CreateMedicationOrderDto {
  @IsString()
  drugId!: string;

  @ValidateNested()
  @Type(() => MedicationDosageDto)
  dosage!: MedicationDosageDto;

  @IsEnum(Frequency)
  frequency!: Frequency;

  @IsEnum(AdministrationRoute)
  route!: AdministrationRoute;

  @IsString()
  duration!: string; // e.g., "7 days", "single dose"

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsEnum(MedicationPriority)
  priority!: MedicationPriority;

  @IsOptional()
  @IsDateString()
  scheduledTime?: string;

  @IsOptional()
  @IsObject()
  additionalParameters?: Record<string, any>;
}