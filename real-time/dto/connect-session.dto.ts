// src/real-time/dto/connect-session.dto.ts
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { UserRole } from 'sharedtypes/dist';

export class ConnectSessionDto {
  @IsString()
  sessionId!: string;

  @IsEnum(UserRole)
  userRole!: UserRole;

  @IsOptional()
  @IsObject()
  connectionMetadata?: {
    deviceType?: string;
    connectionId?: string;
    userAgent?: string;
  };
}