// src/assessment/dto/real-time-feedback-request.dto.ts
import { Type } from 'class-transformer';
import { 
  IsString, 
  IsObject, 
  IsOptional,
  IsNumber,
  IsArray, 
  ValidateNested
} from 'class-validator';

export class ActionContextDto {
  @IsString()
  type!: string;

  @IsObject()
  details!: Record<string, any>;

  @IsString()
  timestamp!: string;

  @IsOptional()
  @IsObject()
  outcome?: Record<string, any>;
}

export class RealTimeFeedbackRequestDto {
  @IsString()
  sessionId!: string;

  @IsObject()
  patientState!: Record<string, any>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ActionContextDto)
  lastAction?: ActionContextDto | undefined;

  @IsNumber()
  timeElapsed!: number; // in minutes

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  recentActions?: Record<string, any>[] | undefined;

  @IsOptional()
  @IsObject()
  learningObjectives?: Record<string, any> | undefined;

  @IsOptional()
  @IsString()
  focusArea?: string | undefined; // Specific competency to focus on
}