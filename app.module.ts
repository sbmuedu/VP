import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { SessionsModule } from './sessions/sessions.module';
import { MedicalModule } from './medical/medical.module';
import { AssessmentModule } from './assessment/assessment.module';
import { OrdersModule } from './orders/orders.module';
import { LLMModule } from './llm/llm.module';
import { RealTimeModule } from './real-time/real-time.module';

// Database module - NOW USING PRISMA MODULE
import { PrismaModule } from './prisma/prisma.module';

// Guards and configuration
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ThrottlerModule } from '@nestjs/throttler';

/**
 * MAIN APPLICATION MODULE
 * 
 * This is the root module that imports all feature modules and configures
 * global providers and middleware.
 * 
 * MODULE STRUCTURE:
 * - PrismaModule: Global database access (imported once)
 * - ConfigModule: Environment configuration
 * - Feature modules: Auth, Users, Scenarios, Sessions, etc.
 * - Global guards: JWT authentication guard
 */
@Module({
  imports: [
    /**
     * CONFIGURATION MODULE
     * Loads environment variables and configuration files
     */
    ConfigModule.forRoot({
      isGlobal: true, // Makes configuration available across all modules
      load: [configuration],
      envFilePath: '.env',
    }),

    /**
     * PRISMA MODULE (GLOBAL)
     * Provides database access to all modules
     * Only imported here due to @Global() decorator
     */
    PrismaModule,
    
    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60,
      limit: 100,
    }]),
    
    /**
     * FEATURE MODULES
     * Each module represents a bounded context in the application
     */
    AuthModule,          // Authentication & authorization
    UsersModule,         // User management
    ScenariosModule,     // Medical scenario management
    SessionsModule,      // Training session management
    MedicalModule,       // Medical logic & calculations
    AssessmentModule,    // Student assessment & evaluation
    OrdersModule,        // Medical orders (medications, labs, procedures)
    LLMModule,          // AI/Language model integration
    RealTimeModule,     // WebSocket & real-time features
  ],
  providers: [
    /**
     * GLOBAL AUTH GUARD
     * Applies JWT authentication to all routes by default
     * Individual routes can use @Public() decorator to opt-out
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Make sure this matches your actual guard name
    },
  ],
})
export class AppModule {
  constructor() {
    console.log('Application module initialized with global Prisma database access');
  }
}