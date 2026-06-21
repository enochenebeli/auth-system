"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitGuard = exports.RateLimit = exports.RATE_LIMIT_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const redis_service_1 = require("./redis.service");
exports.RATE_LIMIT_KEY = 'rateLimit';
const RateLimit = (limit, windowSeconds) => (0, common_1.SetMetadata)(exports.RATE_LIMIT_KEY, { limit, windowSeconds });
exports.RateLimit = RateLimit;
let RateLimitGuard = class RateLimitGuard {
    constructor(redis, reflector) {
        this.redis = redis;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const options = this.reflector.get(exports.RATE_LIMIT_KEY, context.getHandler());
        if (!options)
            return true;
        const req = context.switchToHttp().getRequest();
        const ip = req.ip ?? 'unknown';
        const route = req.route?.path ?? req.path;
        const key = `rate_limit:${route}:${ip}`;
        const current = await this.redis.get(key);
        const count = current ? parseInt(current, 10) : 0;
        if (count >= options.limit) {
            throw new common_1.HttpException({ message: 'Too many requests. Please try again later.' }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (count === 0) {
            await this.redis.setex(key, options.windowSeconds, '1');
        }
        else {
            await this.redis.set(key, String(count + 1));
        }
        return true;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        core_1.Reflector])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map