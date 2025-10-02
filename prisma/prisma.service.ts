import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService extends the PrismaClient and provides lifecycle hooks
 * for proper database connection management.
 * 
 * @Injectable() decorator makes this service available for dependency injection
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {

  /**
   * Constructor initializes PrismaClient with logging options
   */
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
      errorFormat: 'colorless',
    });
  }

  /**
   * Establishes database connection when module initializes
   */
  async onModuleInit() {
    await this.$connect();

    // Add logging for queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: any) => {
        console.log('Query: ' + e.query);
        console.log('Params: ' + e.params);
        console.log('Duration: ' + e.duration + 'ms');
      });
    }
  }

  /**
   * Closes database connection when module destroys
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper method for transaction operations
   */
  // async transactional<T>(operation: (prisma: PrismaService) => Promise<T>): Promise<T> {
  //   return await this.$transaction(async (prisma: PrismaService) => {
  //     return await operation(prisma as PrismaService);
  //   });
  // }
}