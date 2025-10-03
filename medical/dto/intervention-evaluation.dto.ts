// src/medical/dto/intervention-evaluation.dto.ts
import {
  IsString,
  IsObject,
  IsOptional,
  IsEnum
} from 'class-validator';
import { InterventionType } from '@BackEnd/sharedTypes';
import { EmotionalState } from '@prisma/client';

export class InterventionEvaluationDto {
  @IsString()
  sessionId!: string;


  // @IsString()
  // type: string;
  @IsEnum(InterventionType)
  type: InterventionType = InterventionType.PREVENTIVE;// "PREVENTIVE"; reza

  @IsObject()
  contextData: any;

  @IsEnum(EmotionalState)
  emotionalContext: EmotionalState = EmotionalState.CALM;

  @IsOptional()
  @IsString()
  studentResponse?: string;

  // @IsEnum(InterventionType)
  // type: InterventionType = InterventionType.PREVENTIVE;// "PREVENTIVE"; reza

  // @IsObject()
  // details!: Record<string, any>;

  // @IsString()
  // timing!: string; // virtual timestamp

  // @IsOptional()
  // @IsObject()
  // patientState?: Record<string, any>;

  // @IsOptional()
  // @IsObject()
  // clinicalContext?: Record<string, any>;

  // @IsOptional()
  // @IsString()
  // rationale?: string;
}