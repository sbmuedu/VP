// src/medical/dto/medication-response-prediction.dto.ts
import { 
  IsString, 
  IsObject, 
  IsOptional, 
  IsArray
} from 'class-validator';

export class MedicationResponsePredictionDto {
  @IsString()
  drugId!: string;

  @IsObject()
  patientState!: Record<string, any>;

  @IsString()
  dosage!: string;

  @IsString()
  route!: string;

  @IsOptional()
  @IsObject()
  comorbidities?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @IsOptional()
  @IsObject()
  pharmacokineticFactors?: Record<string, any>;
}