import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from 'sharedtypes/dist';

/**
 * Data Transfer Object for user registration
 * Validates all required fields for user creation
 */
export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@medicaluniversity.edu',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'User password (min 6 characters)',
    minLength: 6,
    example: 'securePassword123',
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  firstName!: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  lastName!: string;

  @ApiProperty({
    description: 'User role in the system',
    enum: UserRole,
    example: UserRole.STUDENT,
  })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({
    description: 'Medical specialization (for experts and supervisors)',
    required: false,
    example: 'Cardiology',
  })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiProperty({
    description: 'License number (for medical professionals)',
    required: false,
    example: 'MD-123456',
  })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiProperty({
    description: 'Institutional code for multi-tenant support',
    required: false,
    example: 'MEDUNI-001',
  })
  @IsOptional()
  @IsString()
  institutionCode?: string;
}