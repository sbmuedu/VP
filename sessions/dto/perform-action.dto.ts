import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsObject, IsOptional } from 'class-validator';
import { EventPriority } from 'sharedtypes/dist';

/**
 * Data Transfer Object for performing medical actions
 */
export class PerformActionDto {
  @ApiProperty({
    description: 'Type of action to perform',
    example: 'examination',
    examples: ['examination', 'medication', 'procedure', 'diagnostic', 'order'],
  })
  @IsString()
  actionType!: string;

  @ApiProperty({
    description: 'Details of the action',
    example: {
      procedure: 'blood_pressure_measurement',
      location: 'left_arm',
    },
  })
  @IsObject()
  actionDetails: any;

  @ApiProperty({
    description: 'Priority of the action',
    enum: EventPriority,
    example: EventPriority.MEDIUM,
    default: EventPriority.MEDIUM,
  })
  @IsEnum(EventPriority)
  @IsOptional()
  priority?: EventPriority = EventPriority.MEDIUM;
}