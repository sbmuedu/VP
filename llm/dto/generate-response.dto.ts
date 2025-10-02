import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { EmotionalState, VitalSigns } from 'sharedtypes/dist';

/**
 * Data Transfer Object for generating patient responses
 */
export class GenerateResponseDto {
  @ApiProperty({
    description: 'Question or statement from the user',
    example: 'Can you describe the pain in more detail?',
  })
  @IsString()
  prompt!: string;  //reza

  @ApiProperty({
    description: 'Conversation context including patient state',
    example: {
      patientState: {
        vitalSigns: {
          bloodPressure: { systolic: 140, diastolic: 90 },
          heartRate: 95,
          respiratoryRate: 20,
          temperature: 37.8,
          oxygenSaturation: 96,
          painLevel: 7,
        },
        symptoms: ['chest pain', 'shortness of breath'],
        mentalStatus: 'Anxious but oriented',
      },
      medicalHistory: 'Hypertension, former smoker',
      currentSymptoms: ['chest pain', 'shortness of breath'],
      vitalSigns: {
        bloodPressure: { systolic: 140, diastolic: 90 },
        heartRate: 95,
        respiratoryRate: 20,
        temperature: 37.8,
        oxygenSaturation: 96,
        painLevel: 7,
      },
      emotionalState: EmotionalState.ANXIOUS,
      painLevel: 7,
      conversationHistory: [
        {
          role: 'user',
          content: 'Hello, how are you feeling?',
          timestamp: new Date(),
        },
      ],
      educationalObjectives: [
        'Recognize symptoms of myocardial infarction',
        'Perform appropriate cardiac workup',
      ],
    },
  })
  @IsObject()
  context: any;

  @ApiProperty({
    description: 'LLM model to use for generation',
    example: 'mistral',
    default: 'mistral',
  })
  @IsString()
  @IsOptional()
  model?: string = 'mistral';

  @ApiProperty({
    description: 'Temperature for response generation (0.0 - 2.0)',
    example: 0.7,
    default: 0.7,
  })
  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number = 0.7;

  @ApiProperty({
    description: 'Maximum tokens in response',
    example: 500,
    default: 500,
  })
  @IsNumber()
  @IsOptional()
  maxTokens?: number = 500;
}