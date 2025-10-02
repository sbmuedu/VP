// src/medical/models/complication-model.ts
export class ComplicationProbabilityModel {
  evaluateRisk(
    currentState: any,
    physiologicalChanges: any,
    interventions: any[],
    complicationRisks: string[]
  ): { newComplications: string[]; riskLevel: number } {
    const newComplications: string[] = [];
    let riskLevel = 0.1; // Base risk

    // Evaluate based on vital signs
    if (physiologicalChanges.heartRate > 120) {
      riskLevel += 0.3;
      if (riskLevel > 0.7) newComplications.push('tachycardia');
    }

    if (physiologicalChanges.bloodPressure?.systolic < 90) {
      riskLevel += 0.4;
      if (riskLevel > 0.7) newComplications.push('hypotension');
    }

    if (physiologicalChanges.oxygenSaturation < 92) {
      riskLevel += 0.5;
      if (riskLevel > 0.7) newComplications.push('hypoxia');
    }

    // Evaluate based on interventions
    const highRiskInterventions = interventions.filter(i => 
      i.type === 'invasive_procedure' || i.details?.risk === 'high'
    );
    riskLevel += highRiskInterventions.length * 0.2;

    // Scenario-specific risks
    riskLevel += complicationRisks.length * 0.1;

    return {
      newComplications: [...new Set(newComplications)],
      riskLevel: Math.min(1, riskLevel),
    };
  }
}