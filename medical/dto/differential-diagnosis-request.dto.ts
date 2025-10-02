// src/medical/dto/differential-diagnosis-request.dto.ts
import { Type } from 'class-transformer';
import { 
  IsObject, 
  IsOptional, 
  IsArray,
  IsString, 
  ValidateNested
} from 'class-validator';

export class SymptomDto {
  @IsString()
  description!: string;

  @IsString()
  onset!: string;

  @IsString()
  severity!: string;

  @IsOptional()
  @IsObject()
  characteristics?: Record<string, any>;
}

export class DifferentialDiagnosisRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SymptomDto)
  symptoms!: SymptomDto[];

  @IsObject()
  patientState!: Record<string, any>; 

  @IsObject()
  vitalSigns!: Record<string, any>;

  @IsOptional()
  @IsObject()
  medicalHistory?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentFindings?: string[];

  @IsOptional()
  @IsObject()
  labResults?: Record<string, any>;

  @IsOptional()
  @IsString()
  scenarioContext?: string;
}