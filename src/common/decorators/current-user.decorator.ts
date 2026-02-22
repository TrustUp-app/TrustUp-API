import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * PLACEHOLDER — This file will be fully implemented in API-03.
 *
 * The final implementation will:
 *  - Extract req.user from the ExecutionContext (set by JwtAuthGuard)
 *  - Return the full user object: { wallet: string }
 *
 * The shape of the returned object is defined by API-03's JwtStrategy.validate().
 *
 * DO NOT implement business logic here — wait for API-03.
 */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);
