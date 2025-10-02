// src/medical/medical.module.ts
import { Module } from '@nestjs/common';
import { MedicalService } from './medical.service';
import { MedicalController } from './medical.controller';
// import { PrismaModule } from '../database/prisma.module';    reza
import { DatabaseModule as  PrismaModule } from '../database/database.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [PrismaModule, LLMModule],
  controllers: [MedicalController],
  providers: [MedicalService],
  exports: [MedicalService],
})
export class MedicalModule {}