// src/real-time/dto/typing-indicator.dto.ts
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class TypingIndicatorDto {
  @IsString()
  sessionId!: string;

  @IsString()
  userId!: string;

  @IsBoolean()
  isTyping!: boolean;

  @IsString()
  @IsOptional()
  target?: string; // 'patient', 'supervisor', or specific user ID

  @IsString()
  @IsOptional()
  context?: string; // What they're typing about
}