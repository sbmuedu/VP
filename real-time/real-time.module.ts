// src/real-time/real-time.module.ts
import { Module } from '@nestjs/common';
import { RealTimeService } from './real-time.service';
import { RealTimeGateway } from './real-time.gateway';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  providers: [RealTimeService, RealTimeGateway],
  exports: [RealTimeService],
})
export class RealTimeModule {}