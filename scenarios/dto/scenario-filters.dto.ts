import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsNumber } from 'class-validator';
import { ScenarioDifficulty } from 'sharedtypes/dist';
import { Type } from 'class-transformer';

/**
 * Data Transfer Object for filtering and paginating scenarios
 */
export class ScenarioFiltersDto {
  @ApiProperty({
    description: 'Filter by difficulty level',
    enum: ScenarioDifficulty,
    required: false,
  })
  @IsEnum(ScenarioDifficulty)
  @IsOptional()
  difficulty?: ScenarioDifficulty;

  @ApiProperty({
    description: 'Filter by medical specialty',
    example: 'Cardiology',
    required: false,
  })
  @IsString()
  @IsOptional()
  specialty?: string;

  @ApiProperty({
    description: 'Search in title and description',
    example: 'chest pain',
    required: false,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'Filter by tags',
    example: 'emergency',
    required: false,
  })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    default: 10,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number = 10;
}