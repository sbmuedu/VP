// src/assessment/dto/debrief-config.dto.ts
import { 
  IsBoolean, 
  IsOptional, 
  IsObject,
  IsArray,
  IsString 
} from 'class-validator';

export class DebriefConfigDto {
  @IsBoolean()
  @IsOptional()
  includePeerComparison?: boolean = true;

  @IsBoolean()
  @IsOptional()
  includeDetailedBreakdown?: boolean = true;

  @IsBoolean()
  @IsOptional()
  includeRecommendedResources?: boolean = true;

  @IsBoolean()
  @IsOptional()
  includeActionReplay?: boolean = false;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  focusAreas?: string[];

  @IsObject()
  @IsOptional()
  feedbackStyle?: Record<string, any>; // constructive, direct, encouraging

  @IsBoolean()
  @IsOptional()
  generateVideoSummary?: boolean = false;

  @IsString()
  @IsOptional()
  language?: string = 'en';
}