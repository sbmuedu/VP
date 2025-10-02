import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'sharedtypes/dist';

/**
 * RolesGuard for role-based access control
 * Checks if user has required roles to access a route
 * Used with @Roles() decorator
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Determines if the user can activate the route based on their roles
   * @param context - Execution context containing request information
   * @returns boolean indicating if access is granted
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>(
      'roles',
      context.getHandler(),
    );
    
    if (!requiredRoles) {
      return true; // No roles required, access granted
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      return false; // No user authenticated
    }

    return requiredRoles.includes(user.role);
  }
}