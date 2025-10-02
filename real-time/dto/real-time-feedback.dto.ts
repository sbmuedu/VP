// src/real-time/dto/real-time-feedback.dto.ts
import { IsString, IsObject, IsArray, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export enum FeedbackSeverity {
  POSITIVE = 'positive',
  SUGGESTION = 'suggestion',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export class RealTimeFeedbackDto {
  @IsString()
  sessionId!: string;

  @IsString()
  targetUserId!: string;

  @IsEnum(FeedbackSeverity)
  severity!: FeedbackSeverity;

  @IsString()
  message!: string;

  @IsObject()
  @IsOptional()
  context?: {
    actionId?: string;
    competency?: string;
    patientState?: any;
    timestamp?: string;
  };

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  suggestedActions?: string[];

  @IsBoolean()
  @IsOptional()
  requiresAcknowledgment?: boolean;
}