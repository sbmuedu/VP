import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsBoolean, Min, Max, IsOptional } from 'class-validator';

/**
 * Data Transfer Object for fast-forwarding time in a session
 */
export class FastForwardDto {
  @ApiProperty({
    description: 'Number of virtual minutes to fast-forward',
    example: 30,
    minimum: 1,
    maximum: 1440, // 24 hours
  })
  @IsNumber()
  @Min(1)
  @Max(1440)
  virtualMinutes!: number;

  @ApiProperty({
    description: 'Whether to stop if events require attention during fast-forward',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  stopOnEvents?: boolean = true;
}