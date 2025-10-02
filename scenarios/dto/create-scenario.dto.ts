import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsArray,
  IsNumber,
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsObject
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  type CompetencyWeights, ScenarioDifficulty,
  type VitalSigns, EmotionalState
} from 'sharedtypes/dist';

/**
 * Data Transfer Object for creating a new medical scenario
 * Includes validation for all scenario properties
 */
export class CreateScenarioDto {
  @ApiProperty({
    description: 'Scenario title',
    example: 'Chest Pain in Emergency Department',
  })
  @IsString()
  title!: string;

  @ApiProperty({
    description: 'Scenario description',
    example: 'A 45-year-old male presents with acute chest pain and shortness of breath.',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'Scenario difficulty level',
    enum: ScenarioDifficulty,
    example: ScenarioDifficulty.INTERMEDIATE,
  })
  @IsEnum(ScenarioDifficulty)
  difficulty!: ScenarioDifficulty;

  @ApiProperty({
    description: 'Medical specialty',
    example: 'Cardiology',
  })
  @IsString()
  specialty!: string;

  @ApiProperty({
    description: 'Estimated duration in virtual minutes',
    example: 45,
  })
  @IsNumber()
  estimatedDuration!: number;

  @ApiProperty({
    description: 'Time acceleration rate (real minutes to virtual minutes)',
    example: 60,
    default: 60,
  })
  @IsNumber()
  @IsOptional()
  timeAccelerationRate?: number = 60;

  @ApiProperty({
    description: 'Maximum fast-forward duration in virtual minutes',
    example: 120,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  maxFastForwardDuration?: number;

  @ApiProperty({
    description: 'Whether time pressure is enforced',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  requiresTimePressure?: boolean = false;

  @ApiProperty({
    description: 'Competency weights for assessment',
    example: {
      diagnostic: 0.3,
      procedural: 0.25,
      communication: 0.2,
      professionalism: 0.15,
      criticalThinking: 0.1,
    },
  })
  @IsObject()
  competencyWeights!: CompetencyWeights;

  @ApiProperty({
    description: 'Learning objectives',
    example: [
      'Recognize symptoms of myocardial infarction',
      'Perform appropriate cardiac workup',
      'Initiate timely treatment for STEMI',
    ],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  learningObjectives!: string[];

  @ApiProperty({
    description: 'Chief complaint',
    example: 'Chest pain and shortness of breath',
  })
  @IsString()
  chiefComplaint!: string;

  @ApiProperty({
    description: 'History of present illness',
    example: 'Patient reports sudden onset of chest pain 2 hours ago, radiating to left arm.',
  })
  @IsString()
  historyOfPresentIllness!: string;

  @ApiProperty({
    description: 'Past medical history',
    example: 'Hypertension, hyperlipidemia, former smoker',
  })
  @IsString()
  pastMedicalHistory!: string;

  @ApiProperty({
    description: 'Current medications',
    example: ['Lisinopril 10mg daily', 'Atorvastatin 20mg daily'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  medications!: string[];

  @ApiProperty({
    description: 'Allergies',
    example: ['Penicillin - rash'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  allergies!: string[];

  @ApiProperty({
    description: 'Initial vital signs',
    example: {
      bloodPressure: { systolic: 180, diastolic: 100 },
      heartRate: 110,
      respiratoryRate: 22,
      temperature: 37.2,
      oxygenSaturation: 92,
      painLevel: 8,
    },
  })
  @IsObject()
  initialVitalSigns!: VitalSigns;

  @ApiProperty({
    description: 'Initial emotional state',
    enum: EmotionalState,
    example: EmotionalState.ANXIOUS,
  })
  @IsEnum(EmotionalState)
  initialEmotionalState!: EmotionalState;

  @ApiProperty({
    description: 'Physiology model configuration',
    example: {
      cardiovascular: {
        baseline: 1.0,
        variability: 0.1,
        responseToInterventions: [],
        failureThresholds: [],
      },
      respiratory: {
        baseline: 1.0,
        variability: 0.1,
        responseToInterventions: [],
        failureThresholds: [],
      },
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  physiologyModel?: any;

  @ApiProperty({
    description: 'Complication triggers',
    example: [
      {
        condition: 'delayed_treatment',
        triggerValue: 30,
        complication: 'myocardial_infarction',
        severity: 'HIGH',
      },
    ],
    required: false,
  })
  @IsArray()
  @IsOptional()
  complicationTriggers?: any[];

  @ApiProperty({
    description: 'Natural disease progression',
    example: {
      stages: [
        {
          stage: 1,
          description: 'Early ischemia',
          vitalSignChanges: { heartRate: 100 },
          symptoms: ['chest_pain'],
          complications: [],
        },
      ],
      timeToNextStage: 30,
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  naturalProgression?: any;

  @ApiProperty({
    description: 'Scheduled events',
    example: [
      {
        virtualTime: '00:15',
        eventType: 'ecg_results',
        details: { rhythm: 'ST_elevation' },
        requiresAttention: true,
      },
    ],
    required: false,
  })
  @IsArray()
  @IsOptional()
  scheduledEvents?: any[];

  @ApiProperty({
    description: 'Branching paths for decision points',
    example: [
      {
        decisionPoint: 'treatment_selection',
        options: [
          {
            choice: 'thrombolytics',
            nextScenarioState: 'reperfusion',
            consequences: ['bleeding_risk'],
          },
        ],
      },
    ],
    required: false,
  })
  @IsArray()
  @IsOptional()
  branchingPaths?: any[];

  @ApiProperty({
    description: 'Tags for categorization',
    example: ['cardiac', 'emergency', 'acute'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}