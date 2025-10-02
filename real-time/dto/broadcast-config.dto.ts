// src/real-time/dto/broadcast-config.dto.ts
import { IsBoolean, IsOptional, IsArray, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';

export enum BroadcastScope {
  ALL_USERS = 'all_users',
  STUDENTS_ONLY = 'students_only',
  SUPERVISORS_ONLY = 'supervisors_only',
  SPECIFIC_USERS = 'specific_users',
}

export class BroadcastConfigDto {
  @IsEnum(BroadcastScope)
  scope!: BroadcastScope;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetUserIds?: string[];

  @IsBoolean()
  @IsOptional()
  includeSender?: boolean = false;

  @IsBoolean()
  @IsOptional()
  persistent?: boolean = false; // Whether to store the message

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(3600)
  ttl?: number = 300; // Time to live in seconds (5 minutes default)
}