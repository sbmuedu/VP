import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional } from 'class-validator';

/**
 * Data Transfer Object for conversation analysis
 */
export class AnalyzeConversationDto {
  @ApiProperty({
    description: 'Conversation history to analyze',
    example: [
      {
        role: 'user',
        content: 'Can you describe your pain?',
        timestamp: new Date(),
      },
      {
        role: 'patient',
        content: 'It feels like pressure in my chest, and it radiates to my left arm.',
        timestamp: new Date(),
        emotionalContext: 'ANXIOUS',
      },
    ],
  })
  @IsArray()
  conversationHistory!: any[];

  @ApiProperty({
    description: 'Educational objectives for this scenario',
    example: ['Recognize cardiac symptoms', 'Perform appropriate history taking'],
    required: false,
  })
  @IsArray()
  @IsOptional()
  educationalObjectives?: string[];

  @ApiProperty({
    description: 'Patient context for analysis',
    required: false,
  })
  @IsObject()
  @IsOptional()
  patientContext?: any;
}