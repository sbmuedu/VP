// src/real-time/dto/real-time-message.dto.ts
import { IsString, IsEnum, IsOptional, IsObject, IsDateString } from 'class-validator';

export enum MessageType {
  PATIENT_STATE_UPDATE = 'PATIENT_STATE_UPDATE',
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  TIME_EVENT = 'TIME_EVENT',
  SESSION_STATUS_CHANGE = 'SESSION_STATUS_CHANGE',
  REAL_TIME_FEEDBACK = 'REAL_TIME_FEEDBACK',
  USER_JOINED = 'USER_JOINED',
  USER_LEFT = 'USER_LEFT',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  ACTION_PERFORMED = 'ACTION_PERFORMED',
  COMPLICATION_OCCURRED = 'COMPLICATION_OCCURRED',
  VITAL_SIGN_ALERT = 'VITAL_SIGN_ALERT',
}

export class RealTimeMessageDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsString()
  sessionId!: string;

  @IsObject()
  payload!: Record<string, any>;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsDateString()
  @IsOptional()
  timestamp?: string;

  @IsObject()
  @IsOptional()
  metadata?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    requiresAcknowledgment?: boolean;
    ttl?: number; // Time to live in seconds
  };
}