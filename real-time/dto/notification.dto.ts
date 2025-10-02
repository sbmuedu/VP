// src/real-time/dto/notification.dto.ts
import { IsString, IsEnum, IsOptional, IsObject, IsDateString, IsNumber, Min, Max } from 'class-validator';

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum NotificationType {
  PATIENT_DETERIORATION = 'patient_deterioration',
  ORDER_REQUIRES_ATTENTION = 'order_requires_attention',
  TIME_EVENT_TRIGGERED = 'time_event_triggered',
  SUPERVISOR_INTERVENTION = 'supervisor_intervention',
  SYSTEM_ALERT = 'system_alert',
  COMPETENCY_FEEDBACK = 'competency_feedback',
}

export enum NotificationStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  EXPIRED = 'expired',
  DISMISSED = 'dismissed',
}

export class NotificationDto {

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  sessionId!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsEnum(NotificationPriority)
  priority!: NotificationPriority;


  @IsEnum(NotificationStatus)
  @IsOptional()
  status?: NotificationStatus = NotificationStatus.ACTIVE;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsString()
  @IsOptional()
  actionUrl?: string; // URL for deep linking

  @IsString()
  @IsOptional()
  acknowledgedBy?: string;

  @IsDateString()
  @IsOptional()
  acknowledgedAt?: string;

  @IsDateString()
  @IsOptional()
  createdAt?: string;

  @IsNumber()
  @Min(0)
  @Max(3600)
  @IsOptional()
  autoExpireIn?: number; // Seconds until auto-expiration
}