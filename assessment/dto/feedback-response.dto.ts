// src/assessment/dto/feedback-response.dto.ts
import { Type } from 'class-transformer';
import { 
  IsArray, 
  IsObject, 
  IsOptional,
  IsString,
  IsNumber, 
  ValidateNested
} from 'class-validator';

export class SuggestionDto {
  @IsString()
  category!: string;

  @IsString()
  suggestion!: string;

  @IsString()
  rationale!: string;

  @IsNumber()
  priority!: number; // 1-5, with 5 being highest priority

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resources?: string[];
}

export class WarningDto {
  @IsString()
  type!: string;

  @IsString()
  message!: string;

  @IsString()
  severity!: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsString()
  immediateAction?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class FeedbackResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestionDto)
  suggestions!: SuggestionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WarningDto)
  warnings!: WarningDto[];

  @IsArray()
  @IsString({ each: true })
  positiveFeedback!: string[];

  @IsArray()
  @IsString({ each: true })
  learningPoints!: string[];

  @IsObject()
  @IsOptional()
  competencyImpact?: Record<string, number>;

  @IsString()
  @IsOptional()
  overallAssessment?: string;

  @IsNumber()
  confidenceScore!: number; // 0-1 indicating confidence in assessment
}