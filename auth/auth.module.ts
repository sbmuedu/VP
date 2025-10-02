import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DatabaseModule } from '../prisma/prisma.module';

/**
 * Authentication Module
 * Configures JWT, Passport, and authentication services
 */
@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.registerAsync(
      {
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const secret = configService.get<string>('jwt.secret');
          const expiresIn = configService.get<string | number>('jwt.expiration') || '60m'; // Default value
          // Validate required configuration
          if (!secret) {
            throw new Error('JWT_SECRET environment variable is required');
          }
          const signOptions: any = {
            issuer: configService.get<string>('JWT_ISSUER') || 'virtual-patient-platform',
            audience: configService.get<string>('JWT_AUDIENCE') || 'virtual-patient-users',
          };
          // Only add expiresIn if it exists
          if (expiresIn) {
            signOptions.expiresIn = expiresIn;
          }
          return {
            secret,
            signOptions,
          };
          // return {
          //   secret,
          //   signOptions: {
          //     expiresIn,
          //     issuer: configService.get<string>('JWT_ISSUER') || 'virtual-patient-platform',
          //     audience: configService.get<string>('JWT_AUDIENCE') || 'virtual-patient-users',
          //   },
          // };
        },
        inject: [ConfigService],
      }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule { } 
