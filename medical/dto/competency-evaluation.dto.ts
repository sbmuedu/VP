// src/medical/dto/competency-evaluation.dto.ts
import { Type } from 'class-transformer';
import { 
  IsObject, 
  IsArray, 
  IsOptional,
  IsString, 
  ValidateNested
} from 'class-validator';

export class ActionEvaluationDto {
  @IsString()
  actionType!: string;

  @IsObject()
  actionDetails!: Record<string, any>;

  @IsString()
  timestamp!: string;

  @IsObject()
  context!: Record<string, any>;

  @IsOptional()
  @IsObject()
  outcome?: Record<string, any>;
}

export class CompetencyEvaluationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionEvaluationDto)
  actions!: ActionEvaluationDto[];

  @IsObject()
  conversationHistory!: Record<string, any>;

  @IsArray()
  @IsObject({ each: true })
  decisionPoints!: Record<string, any>[];

  @IsObject()
  finalOutcome!: Record<string, any>;

  @IsOptional()
  @IsObject()
  timingMetrics?: Record<string, any>;
}