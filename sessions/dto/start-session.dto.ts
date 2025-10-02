import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssessmentType } from 'sharedtypes/dist';

/**
 * Data Transfer Object for starting a new scenario session
 */
export class StartSessionDto {
  @ApiProperty({
    description: 'Type of assessment for this session',
    enum: AssessmentType,
    example: AssessmentType.FORMATIVE,
    default: AssessmentType.FORMATIVE,
  })
  @IsEnum(AssessmentType)
  @IsOptional()
  assessmentType?: AssessmentType = AssessmentType.FORMATIVE;

  @ApiProperty({
    description: 'Optional supervisor ID to monitor the session',
    required: false,
    example: 'uuid-of-supervisor',
  })
  @IsString()
  @IsOptional()
  supervisorId?: string;
}