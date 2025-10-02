import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from 'sharedtypes/dist';
import { RegisterDto } from '../../auth/dto/register.dto';

/**
 * Data Transfer Object for updating user information
 * All fields are optional for partial updates
 */
export class UpdateUserDto extends PartialType(RegisterDto) {
  @ApiProperty({
    description: 'User email address',
    required: false,
    example: 'updated.email@medicaluniversity.edu',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'User first name',
    required: false,
    example: 'Jane',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    required: false,
    example: 'Smith',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    description: 'User role in the system',
    enum: UserRole,
    required: false,
    example: UserRole.SUPERVISOR,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({
    description: 'Whether the user account is active',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsString()
  isActive?: boolean;
}