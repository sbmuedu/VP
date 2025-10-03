import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PRISMA MODULE
 * 
 * This module provides global access to the PrismaService throughout the application.
 * 
 * KEY FEATURES:
 * - @Global() decorator makes PrismaService available across all modules without imports
 * - Handles database connections and disconnections automatically
 * - Provides the PrismaClient instance for all database operations
 * 
 * USAGE:
 * Other modules can inject PrismaService directly without importing this module
 * due to the @Global() decorator.
 */
@Global() // Makes this module available globally across the entire application
@Module({
  providers: [
    /**
     * PrismaService Provider
     * - Manages database connections
     * - Provides query methods for all database models
     * - Handles connection lifecycle (onModuleInit, onModuleDestroy)
     */
    PrismaService,
  ],
  exports: [
    /**
     * Export PrismaService to make it available for dependency injection
     * across all modules in the application
     */
    PrismaService,
  ],
})
export class PrismaModule {
  /**
   * Module constructor - can be used for additional setup if needed
   */
  constructor() {
    console.log('PrismaModule initialized - Database services now available globally');
  }
}