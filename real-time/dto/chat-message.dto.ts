// src/real-time/dto/chat-message.dto.ts
import { IsString, IsEnum, IsOptional, IsObject, IsBoolean } from 'class-validator';

export enum ChatMessageType {
  USER_MESSAGE = 'user_message',
  SYSTEM_MESSAGE = 'system_message',
  PATIENT_RESPONSE = 'patient_response',
  SUPERVISOR_FEEDBACK = 'supervisor_feedback',
}

export class ChatMessageDto {
  @IsString()
  sessionId!: string;

  @IsString()
  content!: string;

  @IsEnum(ChatMessageType)
  type!: ChatMessageType;

  @IsString()
  @IsOptional()
  targetUserId?: string; // For private messages

  @IsObject()
  @IsOptional()
  context?: {
    emotionalState?: string;
    vitalSigns?: any;
    patientState?: any;
  };

  @IsBoolean()
  @IsOptional()
  isUrgent?: boolean;

  @IsString()
  @IsOptional()
  replyTo?: string; // Message ID this is replying to
}