import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentUser decorator for easy access to authenticated user in controllers
 * Usage: @CurrentUser() user: User
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);