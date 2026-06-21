import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from './redis.service';
export interface RateLimitOptions {
    limit: number;
    windowSeconds: number;
}
export declare const RATE_LIMIT_KEY = "rateLimit";
export declare const RateLimit: (limit: number, windowSeconds: number) => import("@nestjs/common").CustomDecorator<string>;
export declare class RateLimitGuard implements CanActivate {
    private readonly redis;
    private readonly reflector;
    constructor(redis: RedisService, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
