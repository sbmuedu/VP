import { SetMetadata } from '@nestjs/common';

/**
 * Public decorator to mark routes that don't require authentication
 * Bypasses JWT auth guard when applied to routes
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);