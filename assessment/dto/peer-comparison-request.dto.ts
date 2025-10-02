// src/assessment/dto/peer-comparison-request.dto.ts
import { 
  IsString, 
  IsOptional, 
  IsBoolean,
  IsObject 
} from 'class-validator';

export class PeerComparisonRequestDto {
  @IsString()
  sessionId!: string;

  @IsString()
  userId!: string;

  @IsBoolean()
  @IsOptional()
  includeAnonymous?: boolean = true;

  @IsBoolean()
  @IsOptional()
  includeInstitutionOnly?: boolean = false;

  @IsObject()
  @IsOptional()
  filters?: {
    experienceLevel?: string[];
    institution?: string[];
    timeFrame?: string;
  };

  @IsBoolean()
  @IsOptional()
  includeTrends?: boolean = true;

  @IsString()
  @IsOptional()
  comparisonMetric?: string = 'overallScore';
}