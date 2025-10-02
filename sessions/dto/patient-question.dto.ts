import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

/**
 * Data Transfer Object for asking patient questions
 */
export class PatientQuestionDto {
  @ApiProperty({
    description: 'Question to ask the patient',
    example: 'Can you describe the pain in more detail?',
  })
  @IsString()
  question!: string;

  @ApiProperty({
    description: 'Additional context for the LLM',
    required: false,
    example: {
      currentSymptoms: ['chest pain', 'shortness of breath'],
      emotionalState: 'ANXIOUS',
    },
  })
  @IsObject()
  @IsOptional()
  context?: any;
}