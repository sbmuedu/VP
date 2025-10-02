// src/assessment/assessment.module.ts
import { Module } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { AssessmentController } from './assessment.controller';
import { DatabaseModule as PrismaModule } from '../prisma/prisma.module'; //reza
import { LLMModule } from '../llm/llm.module';
import {
  AssessmentEngineService,
  CompetencyCalculatorService,
  FeedbackGeneratorService,
  DebriefEngineService,
  BenchmarksService,
} from './engines';

@Module({
  imports: [PrismaModule, LLMModule],
  controllers: [AssessmentController],
  providers: [
    AssessmentService,
    AssessmentEngineService,
    CompetencyCalculatorService,
    FeedbackGeneratorService,
    DebriefEngineService,
    BenchmarksService,
  ],
  exports: [AssessmentService],
})
export class AssessmentModule {}