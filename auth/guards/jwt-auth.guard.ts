import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Authentication Guard
 * Protects routes requiring valid JWT token
 * Used with @UseGuards(JwtAuthGuard) decorator
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}