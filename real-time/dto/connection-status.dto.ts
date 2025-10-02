// src/real-time/dto/connection-status.dto.ts
import { IsString, IsEnum, IsObject, IsDateString, IsOptional, IsBoolean } from 'class-validator';

export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  IDLE = 'idle',
}

export class ConnectionStatusDto {
  @IsString()
  userId!: string;

  @IsString()
  sessionId!: string;

  @IsEnum(ConnectionStatus)
  status!: ConnectionStatus;

  @IsDateString()
  timestamp!: string;

  @IsObject()
  @IsOptional()
  connectionInfo?: {
    deviceType?: string;
    ipAddress?: string;
    userAgent?: string;
    connectionId?: string;
  };

  @IsBoolean()
  @IsOptional()
  isActiveParticipant?: boolean;
}