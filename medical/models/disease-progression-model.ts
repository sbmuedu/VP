// src/medical/models/disease-progression-model.ts
export class DiseaseProgressionModel {
  private condition: string;

  constructor(condition: string) {
    this.condition = condition;
  }

  calculateProgression(
    timeElapsed: number,
    currentState: any,
    interventions: any[]
  ): any {
    const progressionModels: { [key: string]: (time: number, state: any, interventions: any[]) => any } = {
      'myocardial_infarction': (time, state, interventions) => ({
        inflammation: Math.min(1, time / 120), // 2 hours to peak
        ischemia: Math.min(1, time / 180), // 3 hours to peak
        fever: time > 60 ? 0.3 : 0, // Fever after 1 hour
      }),
      
      'pneumonia': (time, state, interventions) => ({
        fever: Math.min(1, time / 240), // 4 hours to peak fever
        inflammation: Math.min(1, time / 360), // 6 hours to peak inflammation
        respiratory_distress: Math.min(1, time / 480), // 8 hours to peak distress
      }),
      
      'sepsis': (time, state, interventions) => ({
        systemic_inflammation: Math.min(1, time / 60), // 1 hour to peak
        organ_dysfunction: Math.min(1, time / 120), // 2 hours to peak
        fever: 0.8, // High fever characteristic
      }),
    };

    const model = progressionModels[this.condition] || progressionModels['pneumonia'];
    return model!(timeElapsed, currentState, interventions);
  }
}