import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Local components
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
//reza removed from old one 
// import { PrismaModule } from '../prisma/prisma.module';
// import { PassportModule } from '@nestjs/passport';

/**
 * AUTHENTICATION MODULE
 * 
 * Handles user authentication, JWT token management, and authorization.
 * 
 * DEPENDENCIES:
 * - PrismaService: For database operations (available globally)
 * - ConfigService: For JWT secret configuration
 * - JwtModule: For JWT token handling
 */
@Module({
  imports: [
    //reza removed from old one 
    // PrismaModule,
    // PassportModule,

    /**
     * JWT MODULE CONFIGURATION
     * Configures JWT token signing and verification
     */
    JwtModule.registerAsync({
      imports: [ConfigModule],
useFactory: async (configService: ConfigService) => {
        // Get JWT secret with validation
        const jwtSecret = configService.get<string>('JWT_SECRET');
        
        // Validate that JWT_SECRET exists
        if (!jwtSecret) {
          throw new Error(
            'JWT_SECRET environment variable is not defined. ' +
            'Please set JWT_SECRET in your .env file.'
          );
        }

        // Build JWT configuration object
        const jwtConfig: JwtModuleOptions = {
          // REQUIRED: Secret key for signing tokens - must be defined
          secret: jwtSecret,
          
          // OPTIONAL: Token signing options with fallbacks
          signOptions: {
            // Token expiration time (default: 24 hours)
            expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '24h',
            
            // Token issuer (default: VP_platform)
            issuer: configService.get<string>('JWT_ISSUER') || 'VP_platform',
            
            // Token audience (default: VP_users)
            audience: configService.get<string>('JWT_AUDIENCE') || 'VP_users',
          },
        };

        console.log('JWT Module configured successfully');
        return jwtConfig;
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    /**
     * AUTH SERVICE
     * Handles authentication logic, user validation, token generation
     */
    AuthService,

    /**
     * JWT STRATEGY
     * Passport.js strategy for JWT token validation
     */
    JwtStrategy,
  ],
  exports: [
    /**
     * Export JwtModule to make JwtService available to other modules
     * that need to verify or create JWT tokens
     */
    JwtModule,
    //AuthService,   //reza from old one
  ],
})
export class AuthModule { }
