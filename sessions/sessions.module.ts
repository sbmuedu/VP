import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { DatabaseModule } from '../database/database.module';
import { LLMModule } from '../llm/llm.module';

/**
 * Sessions Module
 * Provides scenario session management including time control, patient interactions, and medical actions
 */
@Module({
  imports: [
    DatabaseModule,
    LLMModule, // Required for patient conversations
  ],
  providers: [SessionsService],
  controllers: [SessionsController],
  exports: [SessionsService],
})
export class SessionsModule {}