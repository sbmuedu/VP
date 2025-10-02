import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@BackEnd/sharedTypes';

/**
 * Roles decorator for specifying required roles for route access
 * @param roles - Array of UserRole that can access the route
 * @returns Custom metadata decorator
 */
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);