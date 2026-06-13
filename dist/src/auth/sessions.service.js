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
exports.SessionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const uuid_1 = require("uuid");
let SessionsService = class SessionsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createSession(userId, userAgent, ipAddress) {
        const refreshToken = (0, uuid_1.v4)();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        return this.prisma.session.create({
            data: {
                userId,
                refreshToken,
                userAgent,
                ipAddress,
                expiresAt,
            },
        });
    }
    async findByRefreshToken(refreshToken) {
        return this.prisma.session.findUnique({
            where: { refreshToken },
        });
    }
    async rotateRefreshToken(sessionId) {
        const newRefreshToken = (0, uuid_1.v4)();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        return this.prisma.session.update({
            where: { id: sessionId },
            data: {
                refreshToken: newRefreshToken,
                lastSeenAt: new Date(),
                expiresAt,
            },
        });
    }
    async findAllByUserId(userId) {
        return this.prisma.session.findMany({
            where: {
                userId,
                expiresAt: { gt: new Date() },
            },
            orderBy: { lastSeenAt: 'desc' },
        });
    }
    async deleteSession(sessionId) {
        await this.prisma.session.delete({
            where: { id: sessionId },
        });
    }
    async deleteAllUserSessions(userId, excludeSessionId) {
        await this.prisma.session.deleteMany({
            where: {
                userId,
                ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
            },
        });
    }
    isSessionExpired(session) {
        return session.expiresAt < new Date();
    }
};
exports.SessionsService = SessionsService;
exports.SessionsService = SessionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionsService);
//# sourceMappingURL=sessions.service.js.map