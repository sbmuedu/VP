import {
    Injectable,
    Logger,
    BadRequestException,
    InternalServerErrorException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
    LLMConfig,
    LLMResponse,
    ConversationAnalysis,
    EmotionalState,
    VitalSigns,
    PatientState,
    LLMHealthCheck,
    OllamaGenerateRequest,
    OllamaGenerateResponse,
    OllamaModel
} from 'sharedtypes/dist';
import { PROMPT_TEMPLATES, SYSTEM_PROMPTS, RESPONSE_GUIDELINES } from './prompts/prompt-templates';
import { GenerateResponseDto, AnalyzeConversationDto } from './dto';

/**
 * LLM Service
 * Handles AI-powered patient interactions using Ollama local models
 * Provides medical conversation generation, response analysis, and health monitoring
 */
@Injectable()
export class LLMService {
    private readonly logger = new Logger(LLMService.name);
    private readonly baseUrl: string;
    // private readonly defaultModel: string;   
    private defaultModel: string;      //reza
    private readonly timeout: number;

    constructor(
        private configService: ConfigService,
        private httpService: HttpService,
    ) {
        this.baseUrl = this.configService.get('ollama.baseUrl') || '';  //reza
        this.defaultModel = this.configService.get('ollama.model') || 'mistral';  //reza
        this.timeout = this.configService.get('ollama.timeout') || 30;  //reza
    }

    /**
     * Generates a patient response to a student's question
     * @param prompt - Student's question or statement
     * @param context - Conversation and medical context
     * @param config - LLM configuration overrides
     * @returns Generated patient response with analysis
     */
    async generatePatientResponse(
        prompt: string,
        context: any,
        config?: Partial<LLMConfig>,
    ): Promise<LLMResponse> {
        const startTime = Date.now();

        try {
            // Build the complete prompt with context
            const fullPrompt = this.buildPrompt(prompt, context, 'HISTORY_TAKING');

            // Prepare the request to Ollama
            const request: OllamaGenerateRequest = {
                model: config?.model || this.defaultModel,
                prompt: fullPrompt,
                system: SYSTEM_PROMPTS.MEDICAL_PATIENT,
                options: {
                    temperature: config?.temperature || 0.7,
                    top_p: config?.topP || 0.9,
                    num_predict: config?.maxTokens || 500,
                    stop: ['STUDENT:', 'DOCTOR:', 'PHYSICIAN:', 'NURSE:'],
                },
                stream: false,
            };

            this.logger.debug(`Sending request to Ollama for model: ${request.model}`);

            const response = await firstValueFrom(
                this.httpService.post<OllamaGenerateResponse>(
                    `${this.baseUrl}/api/generate`,
                    request,
                    { timeout: this.timeout }
                )
            );

            const processingTime = Date.now() - startTime;

            // Process and validate the response
            const processedResponse = this.processResponse(
                response.data.response,
                context,
                prompt
            );

            // Analyze the response quality
            const analysis = await this.analyzeResponseQuality(
                prompt,
                processedResponse,
                context
            );

            return {
                rawResponse: response.data.response,
                processedResponse: processedResponse,
                emotionalState: analysis.emotionalState,
                confidence: analysis.confidence,
                vitalSignChanges: analysis.vitalSignChanges,
                triggeredEvents: analysis.triggeredEvents,
                educationalValue: analysis.educationalValue,
                medicalAccuracy: analysis.medicalAccuracy,
                processingTime,
                tokensUsed: response.data.eval_count || 0,
            };
        } catch (error) {
            // Safe logging
            if (error instanceof Error) {
                this.logger.error(`LLM generation failed: ${error.message}`, error.stack);
            } else {
                this.logger.error(`LLM generation failed: ${String(error)}`);
            }

            // Convert to a typed error safely
            const typedError = error as any;

            if (typedError.code === 'ECONNREFUSED') {
                throw new InternalServerErrorException('Ollama service is not available');
            }

            if (typedError.response?.data?.error) {
                throw new BadRequestException(`LLM error: ${typedError.response.data.error}`);
            }

            throw new InternalServerErrorException('Failed to generate patient response');
        }
    }

    /**
     * Generates physical examination findings
     * @param technique - Examination technique used
     * @param context - Patient and scenario context
     * @returns Examination findings description
     */
    async generateExaminationFindings(
        technique: string,
        context: any,
    ): Promise<LLMResponse> {
        const fullPrompt = this.buildPrompt(technique, context, 'PHYSICAL_EXAM');

        const request: OllamaGenerateRequest = {
            model: this.defaultModel,
            prompt: fullPrompt,
            system: SYSTEM_PROMPTS.PHYSIOLOGY_SIMULATOR,
            options: {
                temperature: 0.3, // Lower temperature for more consistent medical findings
                top_p: 0.8,
                num_predict: 300,
            },
            stream: false,
        };

        const response = await firstValueFrom(
            this.httpService.post<OllamaGenerateResponse>(
                `${this.baseUrl}/api/generate`,
                request,
                { timeout: this.timeout }
            )
        );

        return {
            rawResponse: response.data.response,
            processedResponse: this.validateMedicalFindings(response.data.response, context),
            emotionalState: context.emotionalState,
            confidence: 0.9,
            vitalSignChanges: {},
            triggeredEvents: [],
            educationalValue: 0.8,
            medicalAccuracy: 0.95,
            processingTime: 0,
            tokensUsed: response.data.eval_count || 0,
        };
    }

    /**
     * Analyzes a conversation for educational feedback
     * @param analyzeDto - Conversation analysis request
     * @returns Analysis of conversation quality and suggestions
     */
    async analyzeConversation(
        analyzeDto: AnalyzeConversationDto,
    ): Promise<ConversationAnalysis> {
        const conversationText = this.formatConversationForAnalysis(analyzeDto.conversationHistory);

        const analysisPrompt = `
Analyze this medical student-patient conversation and provide educational feedback.

CONVERSATION:
${conversationText}

EDUCATIONAL OBJECTIVES:
${analyzeDto.educationalObjectives?.join(', ') || 'General communication skills'}

PATIENT CONTEXT:
${JSON.stringify(analyzeDto.patientContext, null, 2)}

Please analyze:
1. Communication effectiveness and empathy
2. Medical history taking completeness
3. Clinical reasoning demonstrated
4. Areas for improvement
5. Specific learning gaps

Provide constructive feedback for the medical student:`;

        const request: OllamaGenerateRequest = {
            model: this.defaultModel,
            prompt: analysisPrompt,
            system: SYSTEM_PROMPTS.COMMUNICATION_COACH,
            options: {
                temperature: 0.5,
                top_p: 0.9,
                num_predict: 800,
            },
            stream: false,
        };

        const response = await firstValueFrom(
            this.httpService.post<OllamaGenerateResponse>(
                `${this.baseUrl}/api/generate`,
                request,
                { timeout: this.timeout }
            )
        );

        return this.parseConversationAnalysis(response.data.response, analyzeDto);
    }

    /**
     * Checks the health and status of the Ollama service
     * @returns Health check information
     */
    async healthCheck(): Promise<LLMHealthCheck> {
        const startTime = Date.now();

        try {
            // Check if service is responsive
            const [modelsResponse, generateResponse] = await Promise.all([
                firstValueFrom(
                    this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 5000 })
                ),
                firstValueFrom(
                    this.httpService.post(
                        `${this.baseUrl}/api/generate`,
                        {
                            model: this.defaultModel,
                            prompt: 'Test',
                            stream: false,
                        },
                        { timeout: 5000 }
                    )
                ),
            ]);

            const responseTime = Date.now() - startTime;
            const models = modelsResponse.data.models as OllamaModel[];

            return {
                status: 'healthy',
                models: models,
                activeModel: this.defaultModel,
                responseTime,
            };

        } catch (error) {
            let errorMsg: string = '';
            if (error instanceof Error) {
                errorMsg = error.message;
                this.logger.error(`LLM generation failed: ${error.message}`, error.stack);
            } else {
                errorMsg = String(error);
                this.logger.error(`LLM generation failed: ${String(error)}`);
            }

            return {
                status: 'unhealthy',
                models: [],
                activeModel: this.defaultModel,
                responseTime: 0,
                lastError: errorMsg,
            };
        }
    }

    /**
     * Switches the active LLM model
     * @param model - New model to use
     * @returns Success status
     */
    async switchModel(model: string): Promise<{ success: boolean; message: string }> {
        try {
            // Verify the model exists
            const modelsResponse = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 5000 })
            );

            const models = modelsResponse.data.models as OllamaModel[];
            const modelExists = models.some(m => m.name === model);

            if (!modelExists) {
                return {
                    success: false,
                    message: `Model ${model} not found. Available models: ${models.map(m => m.name).join(', ')}`,
                };
            }

            // Update default model (in a real implementation, this might be stored per session/user)
            this.defaultModel = model;

            return {
                success: true,
                message: `Switched to model: ${model}`,
            };

        } catch (error) {
            let errorMsg: string = String(error);
            if (error instanceof Error) {
                errorMsg = error.message;
                this.logger.error(`Failed to switch model: ${error.message}`);
            }
            else
                this.logger.error(`Failed to switch model: ${String(error)}`);

            return {
                success: false,
                message: `Failed to switch model: ${errorMsg}`,
                // message: `Failed to switch model: ${error.message}`,
            };
        }
    }

    /**
    * Evaluates medical intervention appropriateness
    */
    async evaluateMedicalIntervention(
        intervention: any,
        patientState: any,
        learningObjectives: string[],
        medicalCondition: string
    ): Promise<{
        isAppropriate: boolean;
        confidence: number;
        rationale: string;
        alternatives: string[];
        risks: string[];
    }> {
        // Mock implementation - in real app, this would call an LLM
        return {
            isAppropriate: true,
            confidence: 0.85,
            rationale: 'Intervention aligns with standard treatment guidelines for the condition',
            alternatives: ['Conservative management', 'Alternative medication'],
            risks: ['Potential side effects', 'Drug interactions'],
        };
    }

    /**
     * Generates a differential diagnosis based on patient presentation
     * @param symptoms - Patient symptoms
     * @param context - Additional patient context
     * @returns Differential diagnosis with probabilities
     */
    async generateDifferentialDiagnosis(
        symptoms: string[],
        context: any,
    ): Promise<{
        conditions: Array<{
            condition: string;
            probability: number;
            evidenceFor: string[];
            evidenceAgainst: string[];
            urgency: string;
        }>;
        supportingEvidence: string[];
        rulingOut: string[];
        nextSteps: string[];
    }> {
        // const diagnosisPrompt = `
        //     Generate a differential diagnosis based on the patient presentation.

        //     PATIENT SYMPTOMS: ${symptoms.join(', ')}

        //     ADDITIONAL CONTEXT:
        //     - Age: ${context.age}
        //     - Gender: ${context.gender}
        //     - Vital Signs: ${JSON.stringify(context.vitalSigns)}
        //     - Medical History: ${context.medicalHistory}
        //     - Current Medications: ${context.medications?.join(', ') || 'None'}

        //     Please provide:
        //     1. Top 3-5 differential diagnoses with probabilities
        //     2. Key supporting evidence for each
        //     3. Evidence against less likely conditions
        //     4. Suggested next diagnostic steps
        //     5. Urgency level for each condition

        //     Format as JSON:`;

        // const request: OllamaGenerateRequest = {
        //     model: this.defaultModel,
        //     prompt: diagnosisPrompt,
        //     options: {
        //         temperature: 0.3,
        //         top_p: 0.8,
        //         num_predict: 1000,
        //     },
        //     stream: false,
        // };

        // const response = await firstValueFrom(
        //     this.httpService.post<OllamaGenerateResponse>(
        //         `${this.baseUrl}/api/generate`,
        //         request,
        //         { timeout: this.timeout }
        //     )
        // );

        // return this.parseDifferentialDiagnosis(response.data.response);

        return {// Mock implementation
            conditions: [
                {
                    condition: 'Community-Acquired Pneumonia',
                    probability: 0.75,
                    evidenceFor: ['Fever', 'Cough', 'Consolidation on exam'],
                    evidenceAgainst: ['No pleuritic pain', 'Normal WBC'],
                    urgency: 'high',
                },
                {
                    condition: 'Bronchitis',
                    probability: 0.20,
                    evidenceFor: ['Cough', 'Normal vital signs'],
                    evidenceAgainst: ['Fever present', 'Consolidation on exam'],
                    urgency: 'low',
                },
            ],
            supportingEvidence: ['Fever pattern', 'Lung exam findings'],
            rulingOut: ['Pulmonary embolism', 'Heart failure'],
            nextSteps: ['Chest X-ray', 'Sputum culture', 'Blood tests'],
        };
    }

    /**
    * Generates comprehensive feedback
    */
    async generateComprehensiveFeedback(
        scores: any,
        learningObjectives: string[],
        feedbackAnalysis: any
    ): Promise<string> {
        return 'Comprehensive feedback based on performance analysis...';
    }

    // ========== PRIVATE HELPER METHODS ==========

    /**
     * Builds a complete prompt from template and context
     */
    private buildPrompt(
        userPrompt: string,
        context: any,
        templateType: keyof typeof PROMPT_TEMPLATES,
    ): string {
        const template = PROMPT_TEMPLATES[templateType];

        // Extract context variables
        const variables = {
            question: userPrompt,
            age: context.age || 45,
            gender: context.gender || 'male',
            chiefComplaint: context.chiefComplaint || 'Not specified',
            symptoms: context.currentSymptoms?.join(', ') || 'Not specified',
            painLevel: context.painLevel || 0,
            emotionalState: context.emotionalState || EmotionalState.CALM,
            medicalHistory: context.medicalHistory || 'Not specified',
            vitalSigns: this.formatVitalSigns(context.vitalSigns),
            conversationHistory: this.formatConversationHistory(context.conversationHistory),
            educationalObjectives: context.educationalObjectives?.join(', ') || 'General medical education',
            // Additional template-specific variables
            ...context,
        };

        // Replace variables in template
        return template.replace(/{(\w+)}/g, (match, variable) => {
            return variables[variable] !== undefined ? variables[variable] : match;
        });
    }

    /**
     * Processes and validates LLM responses
     */
    private processResponse(
        rawResponse: string,
        context: any,
        originalPrompt: string,
    ): string {
        // Clean the response
        let processed = rawResponse.trim();

        // Remove any role prefixes that might have been generated
        processed = processed.replace(/^(PATIENT|USER|ASSISTANT):\s*/i, '');

        // Remove excessive whitespace
        processed = processed.replace(/\s+/g, ' ').trim();

        // Validate response doesn't contain prohibited terms
        this.validateResponseContent(processed, context);

        // Ensure response is appropriate length
        if (processed.length > 1000) {
            processed = processed.substring(0, 1000) + '...';
        }

        // Ensure response ends with proper punctuation
        if (!/[.!?]$/.test(processed)) {
            processed += '.';
        }

        return processed;
    }

    /**
     * Validates that response doesn't contain medical terminology or self-diagnosis
     */
    private validateResponseContent(response: string, context: any): void {
        const lowerResponse = response.toLowerCase();

        // Check for prohibited medical terms
        const prohibitedTerms = RESPONSE_GUIDELINES.PROHIBITED_TERMS;
        const foundProhibited = prohibitedTerms.find(term =>
            lowerResponse.includes(term.toLowerCase())
        );

        if (foundProhibited) {
            this.logger.warn(`Response contained prohibited term: ${foundProhibited}`);
            throw new BadRequestException(
                `AI response contained inappropriate medical terminology. Please rephrase your question.`
            );
        }

        // Check for appropriate symptom descriptors
        const hasAppropriateDescriptors = RESPONSE_GUIDELINES.ALLOWED_SYMPTOM_DESCRIPTORS.some(
            descriptor => lowerResponse.includes(descriptor)
        );

        if (!hasAppropriateDescriptors && context.currentSymptoms?.length > 0) {
            this.logger.warn('Response lacks appropriate symptom descriptors');
        }
    }

    /**
     * Validates medical findings for accuracy and appropriateness
     */
    private validateMedicalFindings(findings: string, context: any): string {
        // Basic validation - in production, this would be more sophisticated
        if (findings.length < 10) {
            return 'No significant abnormalities detected.';
        }

        // Ensure findings don't contradict patient state
        if (context.pathology?.includes('normal') && findings.includes('abnormal')) {
            this.logger.warn('Findings contradict patient pathology');
        }

        return findings;
    }

    /**
     * Analyzes response quality for educational and medical accuracy
     */
    private async analyzeResponseQuality(
        prompt: string,
        response: string,
        context: any,
    ): Promise<{
        emotionalState: EmotionalState;
        confidence: number;
        vitalSignChanges: Partial<VitalSigns>;
        triggeredEvents: string[];
        educationalValue: number;
        medicalAccuracy: number;
    }> {
        // Simple analysis - in production, this could use another LLM call
        const emotionalState = this.detectEmotionalState(response);
        const confidence = this.calculateConfidence(response, context);
        const vitalSignChanges = this.inferVitalSignChanges(response, context);
        const triggeredEvents = this.detectTriggeredEvents(response, context);
        const educationalValue = this.assessEducationalValue(prompt, response, context);
        const medicalAccuracy = this.assessMedicalAccuracy(response, context);

        return {
            emotionalState,
            confidence,
            vitalSignChanges,
            triggeredEvents,
            educationalValue,
            medicalAccuracy,
        };
    }

    /**
     * Detects emotional state from response text
     */
    private detectEmotionalState(response: string): EmotionalState {
        const lowerResponse = response.toLowerCase();

        const emotionalKeywords = {
            [EmotionalState.ANXIOUS]: ['worried', 'nervous', 'anxious', 'scared', 'frightened', 'concerned'],
            [EmotionalState.DISTRESSED]: ['pain', 'hurts', 'uncomfortable', 'suffering', 'terrible', 'awful'],
            [EmotionalState.ANGRY]: ['angry', 'frustrated', 'mad', 'annoyed', 'irritated'],
            [EmotionalState.CONFUSED]: ['confused', 'unsure', 'don\'t know', 'uncertain'],
            [EmotionalState.CALM]: ['fine', 'okay', 'alright', 'comfortable', 'relaxed'],
        };

        for (const [state, keywords] of Object.entries(emotionalKeywords)) {
            if (keywords.some(keyword => lowerResponse.includes(keyword))) {
                return state as EmotionalState;
            }
        }

        return EmotionalState.CALM;
    }

    /**
     * Calculates confidence score for the response
     */
    private calculateConfidence(response: string, context: any): number {
        // Simple confidence calculation based on response characteristics
        let confidence = 0.8; // Base confidence

        // Increase confidence for longer, more detailed responses
        if (response.length > 50) confidence += 0.1;
        if (response.length > 100) confidence += 0.1;

        // Decrease confidence for uncertain language
        if (response.includes('not sure') || response.includes('I think') || response.includes('maybe')) {
            confidence -= 0.2;
        }

        // Ensure confidence stays within bounds
        return Math.max(0.1, Math.min(1.0, confidence));
    }

    /**
     * Infers vital sign changes from patient response
     */
    private inferVitalSignChanges(response: string, context: any): Partial<VitalSigns> {
        const changes: Partial<VitalSigns> = {};
        const lowerResponse = response.toLowerCase();

        // Simple inference based on emotional state and content
        const emotionalState = this.detectEmotionalState(response);

        switch (emotionalState) {
            case EmotionalState.ANXIOUS:
                changes.heartRate = 10; // Increase heart rate
                changes.respiratoryRate = 2; // Increase respiratory rate
                break;
            case EmotionalState.DISTRESSED:
                changes.heartRate = 15;
                changes.respiratoryRate = 4;
                changes.painLevel = 2;
                break;
            case EmotionalState.ANGRY:
                changes.heartRate = 20;
                changes.bloodPressure = { systolic: 10, diastolic: 5 };
                break;
        }

        // Additional inferences based on content
        if (lowerResponse.includes('better') || lowerResponse.includes('improved')) {
            changes.painLevel = -2;
            changes.heartRate = -5;
        }

        return changes;
    }

    /**
     * Detects events that should be triggered based on patient response
     */
    private detectTriggeredEvents(response: string, context: any): string[] {
        const events: string[] = [];
        const lowerResponse = response.toLowerCase();

        // Detect symptom changes that might trigger events
        if (lowerResponse.includes('worse') || lowerResponse.includes('getting worse')) {
            events.push('patient_deterioration');
        }

        if (lowerResponse.includes('can\'t breathe') || lowerResponse.includes('difficulty breathing')) {
            events.push('respiratory_distress');
        }

        if (lowerResponse.includes('chest pain') && lowerResponse.includes('worse')) {
            events.push('cardiac_event');
        }

        return events;
    }

    /**
     * Assesses educational value of the interaction
     */
    private assessEducationalValue(prompt: string, response: string, context: any): number {
        // Simple assessment based on response characteristics
        let value = 0.5; // Base value

        // Increase value for detailed symptom descriptions
        const symptomDescriptors = RESPONSE_GUIDELINES.ALLOWED_SYMPTOM_DESCRIPTORS;
        const descriptorCount = symptomDescriptors.filter(desc =>
            response.toLowerCase().includes(desc)
        ).length;

        value += descriptorCount * 0.1;

        // Increase value for emotional expression
        const emotionalWords = Object.values(RESPONSE_GUIDELINES.EMOTIONAL_RESPONSES).flat();
        const emotionalCount = emotionalWords.filter(word =>
            response.toLowerCase().includes(word)
        ).length;

        value += emotionalCount * 0.05;

        return Math.min(1.0, value);
    }

    /**
     * Assesses medical accuracy of the response
     */
    private assessMedicalAccuracy(response: string, context: any): number {
        // Base accuracy - in production, this would be more sophisticated
        let accuracy = 0.8;

        // Check for consistency with patient context
        if (context.pathology && !response.toLowerCase().includes(context.pathology.toLowerCase())) {
            accuracy -= 0.2;
        }

        // Check for appropriate symptom descriptions
        const hasAppropriatePainDescription =
            response.toLowerCase().includes('pain') &&
            (response.includes('pressure') || response.includes('sharp') || response.includes('dull'));

        if (context.painLevel > 0 && !hasAppropriatePainDescription) {
            accuracy -= 0.1;
        }

        return Math.max(0.1, accuracy);
    }

    /**
     * Formats vital signs for prompt inclusion
     */
    private formatVitalSigns(vitalSigns: VitalSigns): string {
        if (!vitalSigns) return 'Not available';

        return `BP: ${vitalSigns.bloodPressure.systolic}/${vitalSigns.bloodPressure.diastolic}, ` +
            `HR: ${vitalSigns.heartRate}, RR: ${vitalSigns.respiratoryRate}, ` +
            `Temp: ${vitalSigns.temperature}°C, SpO2: ${vitalSigns.oxygenSaturation}%, ` +
            `Pain: ${vitalSigns.painLevel}/10`;
    }

    /**
     * Formats conversation history for prompt inclusion
     */
    private formatConversationHistory(history: any[]): string {
        if (!history || history.length === 0) return 'No previous conversation.';

        return history.map(entry =>
            `${entry.role === 'user' ? 'STUDENT' : 'PATIENT'}: ${entry.content}`
        ).join('\n');
    }

    /**
     * Formats conversation for analysis
     */
    private formatConversationForAnalysis(history: any[]): string {
        return history.map(entry =>
            `${entry.role.toUpperCase()}: ${entry.content}${entry.emotionalContext ? ` [${entry.emotionalContext}]` : ''}`
        ).join('\n');
    }

    /**
     * Parses conversation analysis from LLM response
     */
    private parseConversationAnalysis(response: string, analyzeDto: AnalyzeConversationDto): ConversationAnalysis {
        // Simple parsing - in production, this would be more sophisticated
        return {
            conversationQuality: 0.8,
            empathyScore: 0.7,
            clarityScore: 0.8,
            medicalAccuracy: 0.9,
            educationalValue: 0.8,
            identifiedLearningGaps: [
                'Could explore symptoms in more depth',
                'Opportunity to show more empathy',
            ],
            suggestedFollowUpQuestions: [
                'Can you describe the pain in more detail?',
                'How has this been affecting your daily activities?',
            ],
        };
    }

    /**
     * Parses differential diagnosis from LLM response
     */
    private parseDifferentialDiagnosis(response: string): any {
        try {
            // Try to parse JSON response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // Fallback to simple parsing
            return {
                conditions: [
                    {
                        condition: 'Not specified',
                        probability: 0.5,
                        evidenceFor: ['Symptom presentation'],
                        evidenceAgainst: ['Need more information'],
                        urgency: 'MEDIUM',
                    },
                ],
                supportingEvidence: ['Clinical presentation'],
                rulingOut: ['Insufficient information'],
                nextSteps: ['Further diagnostic testing recommended'],
            };

        } catch (error) {
            this.logger.error('Failed to parse differential diagnosis', error);
            throw new BadRequestException('Failed to parse differential diagnosis response');
        }
    }
}
