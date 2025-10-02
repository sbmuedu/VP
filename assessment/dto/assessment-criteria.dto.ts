// src/assessment/dto/assessment-criteria.dto.ts
import { Type } from 'class-transformer';
import { 
  IsObject, 
  IsArray, 
  IsOptional,
  IsNumber,
  Min,
  Max, 
  ValidateNested,
  IsString
} from 'class-validator';

export class CompetencyWeightDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  diagnostic!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  procedural!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  communication!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  professionalism!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  criticalThinking!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  timeEfficiency!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  patientSafety!: number;
}

export class AssessmentCriteriaDto {
  @ValidateNested()
  @Type(() => CompetencyWeightDto)
  weights!: CompetencyWeightDto;

  @IsArray()
  @IsObject({ each: true })
  performanceMetrics!: Record<string, any>[];

  @IsObject()
  scoringRubric!: Record<string, any>;

  @IsOptional()
  @IsObject()
  benchmarks?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criticalErrors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excellenceIndicators?: string[];
}