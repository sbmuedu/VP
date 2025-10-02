// src/medical/dto/physiology-update.dto.ts
import { 
  IsNumber, 
  IsOptional, 
  IsObject, 
  IsArray,
  ValidateNested, 
  IsString
} from 'class-validator';
import { Type } from 'class-transformer';
import { VitalSigns, EmotionalState } from 'sharedtypes/dist';

export class InterventionDto {
  @IsString()
  type!: string;

  @IsObject()
  details!: Record<string, any>;

  @IsString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  performedBy?: string;

  @IsOptional()
  @IsNumber()
  duration?: number; // in minutes
}

export class PhysiologyUpdateDto {
  @IsNumber()
  timeElapsed!: number; // in minutes

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterventionDto)
  interventions!: InterventionDto[];

  @IsOptional()
  @IsObject()
  currentPatientState?: Record<string, any>;

  @IsOptional()
  @IsObject()
  environmentalFactors?: Record<string, any>;
}