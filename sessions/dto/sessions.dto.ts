// src/sessions/dto/sessions.dto.ts

import { IsString, IsEnum, IsNumber, IsObject, IsOptional, Min, IsNotEmpty } from 'class-validator';
import { AssessmentType, EventPriority, TimeFlowMode } from '@prisma/client';

/**
 * START SESSION DATA TRANSFER OBJECT
 * 
 * Used when a student initiates a new medical training session.
 * Contains the essential information needed to start a scenario-based session.
 * 
 * @example
 * {
 *   "scenarioId": "123e4567-e89b-12d3-a456-426614174000",
 *   "assessmentType": "FORMATIVE"
 * }
 */
export class StartSessionDto {
  /**
   * UNIQUE IDENTIFIER FOR THE MEDICAL SCENARIO
   * 
   * References the specific medical case that will be simulated.
   * Must correspond to an active MedicalScenario in the database.
   * 
   * @example "123e4567-e89b-12d3-a456-426614174000"
   */
  @IsString()
  @IsNotEmpty()
  scenarioId: string;

  /**
   * ASSESSMENT TYPE FOR THE SESSION
   * 
   * Determines whether this is for learning (formative) or evaluation (summative).
   * Formative assessments provide feedback for learning.
   * Summative assessments evaluate competency for grading.
   * 
   * @default FORMATIVE
   */
  @IsOptional()
  @IsEnum(AssessmentType)
  assessmentType?: AssessmentType;

  /**
   * CONSTRUCTOR WITH PARTIAL DATA SUPPORT
   * 
   * Allows creating DTO instances with partial data for flexibility.
   * Provides default values to ensure data integrity.
   * 
   * @param data - Partial data to initialize the DTO
   */
  constructor(data: Partial<StartSessionDto> = {}) {
    this.scenarioId = data.scenarioId || '';
    this.assessmentType = data.assessmentType || AssessmentType.FORMATIVE;
  }
}

/**
 * PERFORM MEDICAL ACTION DATA TRANSFER OBJECT
 * 
 * Represents a medical intervention or action performed during a session.
 * This could include examinations, procedures, medication administration, etc.
 * 
 * @example
 * {
 *   "actionType": "physical_exam",
 *   "actionDetails": { "system": "cardiovascular", "findings": "regular rhythm" },
 *   "priority": "MEDIUM"
 * }
 */
export class PerformActionDto {
  /**
   * TYPE OF MEDICAL ACTION BEING PERFORMED
   * 
   * Categorizes the nature of the medical intervention.
   * Common types: physical_exam, medication, procedure, diagnostic_order
   * 
   * @example "physical_exam"
   */
  @IsString()
  @IsNotEmpty()
  actionType: string;

  /**
   * DETAILED INFORMATION ABOUT THE ACTION
   * 
   * Contains specific parameters and context for the medical action.
   * Structure varies based on actionType.
   * 
   * @example { "system": "cardiovascular", "findings": "regular rhythm" }
   */
  @IsObject()
  actionDetails: any;

  /**
   * CLINICAL PRIORITY OF THE ACTION
   * 
   * Indicates the urgency of the medical action.
   * Affects simulation timing and potential consequences.
   * 
   * @default MEDIUM
   */
  @IsOptional()
  @IsEnum(EventPriority)
  priority: EventPriority;

  constructor(data: Partial<PerformActionDto> = {}) {
    this.actionType = data.actionType || '';
    this.actionDetails = data.actionDetails || {};
    this.priority = data.priority || EventPriority.MEDIUM;
  }
}

/**
 * FAST FORWARD TIME DATA TRANSFER OBJECT
 * 
 * Used to advance virtual time in accelerated time mode.
 * Allows simulation of time passage for training efficiency.
 * 
 * @example
 * {
 *   "virtualMinutes": 60
 * }
 */
export class FastForwardDto {
  /**
   * NUMBER OF VIRTUAL MINUTES TO ADVANCE
   * 
   * Represents the amount of time to simulate in the medical scenario.
   * Actual real-time duration depends on the scenario's acceleration rate.
   * 
   * @minimum 1 - Must advance at least 1 virtual minute
   * @example 60 (represents 1 virtual hour)
   */
  @IsNumber()
  @Min(1, { message: 'Must advance at least 1 virtual minute' })
  virtualMinutes: number;

  constructor(data: Partial<FastForwardDto> = {}) {
    this.virtualMinutes = data.virtualMinutes || 0;
  }
}

/**
 * PATIENT QUESTION DATA TRANSFER OBJECT
 * 
 * Represents a question asked to the simulated patient during a session.
 * Used for communication skills assessment and history taking.
 * 
 * @example
 * {
 *   "question": "Can you describe the pain in your chest?",
 *   "context": { "currentSymptoms": ["chest pain"] }
 * }
 */
export class PatientQuestionDto {
  /**
   * QUESTION TEXT TO ASK THE SIMULATED PATIENT
   * 
   * The actual question phrased as it would be asked to a real patient.
   * Used by the LLM to generate appropriate patient responses.
   * 
   * @example "Can you describe the pain in your chest?"
   */
  @IsString()
  @IsNotEmpty()
  question: string;

  /**
   * ADDITIONAL CONTEXT FOR QUESTION INTERPRETATION
   * 
   * Provides situational context to help generate appropriate responses.
   * May include current symptoms, patient state, or conversation history.
   * 
   * @example { "currentSymptoms": ["chest pain"], "emotionalState": "ANXIOUS" }
   */
  @IsOptional()
  @IsObject()
  context?: any;

  constructor(data: Partial<PatientQuestionDto> = {}) {
    this.question = data.question || '';
    this.context = data.context || {};
  }
}

/**
 * END SESSION DATA TRANSFER OBJECT
 * 
 * Used to properly conclude a training session.
 * May include final feedback or assessment notes.
 * 
 * @example
 * {
 *   "finalFeedback": "Excellent diagnostic reasoning and patient communication."
 * }
 */
export class EndSessionDto {
  /**
   * FINAL FEEDBACK OR ASSESSMENT NOTES
   * 
   * Summary feedback provided at the end of the session.
   * Used for formative assessment and learning reinforcement.
   * 
   * @example "Excellent diagnostic reasoning and patient communication."
   */
  @IsOptional()
  @IsString()
  finalFeedback?: string;

  constructor(data: Partial<EndSessionDto> = {}) {
    this.finalFeedback = data.finalFeedback ?? "";
  }
}

/**
 * UPDATE TIME FLOW MODE DATA TRANSFER OBJECT
 * 
 * Controls how virtual time progresses in relation to real time.
 * Allows switching between real-time and accelerated simulation.
 * 
 * @example
 * {
 *   "timeFlowMode": "ACCELERATED"
 * }
 */
export class UpdateTimeFlowModeDto {
  /**
   * TIME FLOW MODE FOR THE SESSION
   * 
   * REAL_TIME: 1 real second = 1 virtual second
   * ACCELERATED: Virtual time moves faster than real time
   * PAUSED: Virtual time is stopped
   * 
   * @example "ACCELERATED"
   */
  @IsEnum(TimeFlowMode)
  timeFlowMode: TimeFlowMode;

  constructor(data: Partial<UpdateTimeFlowModeDto> = {}) {
    this.timeFlowMode = data.timeFlowMode || TimeFlowMode.REAL_TIME;
  }
}

/**
 * ADD SUPERVISOR DATA TRANSFER OBJECT
 * 
 * Used to assign a supervisor to monitor and guide a training session.
 * Supervisors can provide interventions and real-time feedback.
 * 
 * @example
 * {
 *   "supervisorId": "123e4567-e89b-12d3-a456-426614174000"
 * }
 */
export class AddSupervisorDto {
  /**
   * UNIQUE IDENTIFIER OF THE SUPERVISOR USER
   * 
   * References a user with SUPERVISOR or MEDICAL_EXPERT role.
   * Must be a valid user ID in the system.
   * 
   * @example "123e4567-e89b-12d3-a456-426614174000"
   */
  @IsString()
  @IsNotEmpty()
  supervisorId: string;

  constructor(data: Partial<AddSupervisorDto> = {}) {
    this.supervisorId = data.supervisorId || '';
  }
}

/**
 * CREATE INTERVENTION DATA TRANSFER OBJECT
 * 
 * Used by supervisors to provide guidance or corrections during a session.
 * Interventions help students learn and avoid clinical errors.
 * 
 * @example
 * {
 *   "interventionType": "guidance",
 *   "message": "Consider checking the patient's oxygen saturation",
 *   "contextData": { "currentSpO2": 88 }
 * }
 */
export class CreateInterventionDto {
  /**
   * TYPE OF SUPERVISOR INTERVENTION
   * 
   * hint: Gentle suggestion or reminder
   * correction: Points out a specific error
   * guidance: Provides clinical reasoning guidance
   * emergency: Immediate correction for patient safety
   * 
   * @example "guidance"
   */
  @IsString()
  @IsNotEmpty()
  interventionType: string;

  /**
   * INTERVENTION MESSAGE TO THE STUDENT
   * 
   * The actual text of the guidance or correction.
   * Should be educational and constructive.
   * 
   * @example "Consider checking the patient's oxygen saturation"
   */
  @IsString()
  @IsNotEmpty()
  message: string;

  /**
   * CONTEXTUAL DATA FOR THE INTERVENTION
   * 
   * Additional information about the clinical situation.
   * Helps the student understand why the intervention was provided.
   * 
   * @example { "currentSpO2": 88, "timeSinceLastCheck": 15 }
   */
  @IsOptional()
  @IsObject()
  contextData?: any;

  constructor(data: Partial<CreateInterventionDto> = {}) {
    this.interventionType = data.interventionType || '';
    this.message = data.message || '';
    this.contextData = data.contextData || {};
  }
}