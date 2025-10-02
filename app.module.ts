import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { SessionsModule } from './sessions/sessions.module';
import { OrdersModule } from './orders/orders.module';
import { MedicalModule } from './medical/medical.module';
import { AssessmentModule } from './assessment/assessment.module';
import { LLMModule } from './llm/llm.module';
import { RealTimeModule } from './real-time/real-time.module';
import { DatabaseModule } from './prisma/prisma.module';

import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

/**
 * Root Application Module
 * Imports all feature modules and configures global providers
 */
@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60,
      limit: 100,
    }]),

    // Feature modules
    DatabaseModule,
    AuthModule,
    UsersModule,
    ScenariosModule,
    SessionsModule,
    LLMModule,
      // Additional modules to be added:
    // OrdersModule,
    // MedicalModule,
    // AssessmentModule,
    // RealTimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}