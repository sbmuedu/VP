import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

/**
 * Data Transfer Object for user login
 * Includes validation decorators for request validation
 */
export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'student@medicaluniversity.edu',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'User password',
    minLength: 6,
    example: 'securePassword123',
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    description: 'Institutional code for multi-tenant support',
    required: false,
    example: 'MEDUNI-001',
  })
  @IsOptional()
  @IsString()
  institutionCode?: string;
}