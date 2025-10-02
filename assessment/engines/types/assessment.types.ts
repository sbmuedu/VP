// src/assessment/engine/types/assessment.types.ts
export interface AssessmentContext {
  sessionId: string;
  scenario: any;
  actions: any[];
  conversations: any[];
  orders: {
    medications: any[];
    labs: any[];
    procedures: any[];
  };
  events: any[];
  patientState: any;
  startTime: Date;
  endTime?: Date;
  virtualTimeElapsed: number;
  realTimeElapsed: number;
}

export interface CompetencyScores {
  diagnostic: CompetencyScore;
  procedural: CompetencyScore;
  communication: CompetencyScore;
  professionalism: CompetencyScore;
  criticalThinking: CompetencyScore;
}

export interface CompetencyScore {
  score: number;
  feedback: string;
  evidence: string[];
  confidence: number;
}

export type CompetencyDimension = 
  | 'diagnostic' 
  | 'procedural' 
  | 'communication' 
  | 'professionalism' 
  | 'criticalThinking';

export interface RealTimeFeedback {
  suggestions: string[];
  warnings: string[];
  positiveFeedback: string[];
  learningPoints: string[];
  criticalIssues: CriticalIssue[];
  timestamp: Date;
  confidence: number;
}

export interface CriticalIssue {
  type: 'safety' | 'timing' | 'clinical' | 'technical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  immediateAction?: string;
  context: any;
  timestamp: Date;
}

export interface FinalAssessment {
  competencyScores: CompetencyScores;
  overallScore: number;
  timeEfficiencyScore: number;
  clinicalReasoningScore: number;
  patientSafetyScore: number;
  feedback: string;
  benchmarkComparison: BenchmarkComparison;
  detailedBreakdown: any;
  timestamp: Date;
}

export interface BenchmarkComparison {
  percentile: number;
  peerGroup: string;
  strengths: string[];
  areasForImprovement: string[];
  trend: 'improving' | 'stable' | 'declining';
}

export interface DebriefReport {
  executiveSummary: string;
  keyDecisions: DecisionAnalysis[];
  criticalMoments: CriticalMoment[];
  learningObjectivesAchieved: string[];
  areasForImprovement: string[];
  recommendedResources: string[];
  competencyEvolution: CompetencyEvolution[];
  performanceInsights: PerformanceInsight[];
}

export interface DecisionAnalysis {
  decision: string;
  timing: number;
  appropriateness: number;
  impact: number;
  alternativeOptions: string[];
  rationale: string;
}

export interface CriticalMoment {
  time: number;
  event: string;
  response: string;
  effectiveness: number;
  learningOpportunity: string;
}

export interface CompetencyEvolution {
  competency: CompetencyDimension;
  timeline: EvolutionPoint[];
  trend: number;
  criticalJunctures: number[];
}

export interface EvolutionPoint {
  timestamp: Date;
  score: number;
  events: string[];
}

export interface PerformanceInsight {
  category: string;
  insight: string;
  evidence: string[];
  recommendation: string;
}

export interface PeerComparison {
  percentiles: { [key: string]: number };
  strengths: string[];
  weaknesses: string[];
  benchmarkData: BenchmarkData;
  recommendations: string[];
}

export interface BenchmarkData {
  averageScores: { [key: string]: number };
  distribution: { [key: string]: number[] };
  topPerformers: { [key: string]: number };
  experienceLevel: string;
}