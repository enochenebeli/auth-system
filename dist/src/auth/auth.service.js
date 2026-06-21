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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
const sessions_service_1 = require("./sessions.service");
const mail_service_1 = require("../mail/mail.service");
const client_1 = require("@prisma/client");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const bcrypt = require("bcrypt");
const uuid_1 = require("uuid");
let AuthService = class AuthService {
    constructor(prisma, usersService, sessionsService, jwtService, configService, mailService) {
        this.prisma = prisma;
        this.usersService = usersService;
        this.sessionsService = sessionsService;
        this.jwtService = jwtService;
        this.configService = configService;
        this.mailService = mailService;
    }
    async register(dto, meta) {
        const user = await this.usersService.createUser(dto.email, dto.password, dto.name);
        await this.createAndSendVerificationEmail(user);
        return {
            message: "Registration successful. Please check your email to verify your account.",
            userId: user.id,
        };
    }
    async login(dto, meta) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            throw new common_1.UnauthorizedException("Invalid email or password");
        }
        if (!user.passwordHash) {
            throw new common_1.UnauthorizedException("This account uses social login. Please sign in with Google or GitHub.");
        }
        const passwordValid = await this.usersService.verifyPassword(dto.password, user.passwordHash);
        if (!passwordValid) {
            throw new common_1.UnauthorizedException("Invalid email or password");
        }
        if (!user.emailVerified) {
            throw new common_1.ForbiddenException("Please verify your email before logging in.");
        }
        if (user.twoFactorEnabled) {
            if (!dto.totpCode) {
                throw new common_1.UnauthorizedException("Two-factor authentication code is required.");
            }
            const isValidTotp = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: "base32",
                token: dto.totpCode,
                window: 1,
            });
            if (!isValidTotp) {
                const backupValid = await this.verifyBackupCode(user.id, dto.totpCode);
                if (!backupValid) {
                    throw new common_1.UnauthorizedException("Invalid two-factor authentication code.");
                }
            }
        }
        const session = await this.sessionsService.createSession(user.id, meta.userAgent, meta.ipAddress);
        const accessToken = this.generateAccessToken(user);
        return {
            accessToken,
            refreshToken: session.refreshToken,
            user: this.sanitizeUser(user),
        };
    }
    async logout(userId, refreshToken) {
        if (!refreshToken)
            return;
        const session = await this.sessionsService.findByRefreshToken(refreshToken);
        if (session && session.userId === userId) {
            await this.sessionsService.deleteSession(session.id);
        }
    }
    async refreshTokens(refreshToken, meta) {
        if (!refreshToken) {
            throw new common_1.UnauthorizedException("No refresh token provided.");
        }
        const session = await this.sessionsService.findByRefreshToken(refreshToken);
        if (!session) {
            throw new common_1.UnauthorizedException("Invalid refresh token.");
        }
        if (this.sessionsService.isSessionExpired(session)) {
            await this.sessionsService.deleteSession(session.id);
            throw new common_1.UnauthorizedException("Session expired. Please log in again.");
        }
        const user = await this.usersService.findById(session.userId);
        if (!user) {
            throw new common_1.UnauthorizedException("User not found.");
        }
        const rotatedSession = await this.sessionsService.rotateRefreshToken(session.id);
        const accessToken = this.generateAccessToken(user);
        return {
            accessToken,
            refreshToken: rotatedSession.refreshToken,
        };
    }
    async verifyEmail(token) {
        const tokenRecord = await this.prisma.token.findUnique({
            where: { token },
        });
        if (!tokenRecord || tokenRecord.type !== client_1.TokenType.EMAIL_VERIFICATION) {
            throw new common_1.BadRequestException("Invalid or expired verification token.");
        }
        if (tokenRecord.expiresAt < new Date()) {
            throw new common_1.BadRequestException("Verification token has expired. Please request a new one.");
        }
        if (tokenRecord.usedAt) {
            throw new common_1.BadRequestException("This verification link has already been used.");
        }
        await this.prisma.token.update({
            where: { id: tokenRecord.id },
            data: { usedAt: new Date() },
        });
        await this.usersService.markEmailVerified(tokenRecord.userId);
        return { message: "Email verified successfully. You can now log in." };
    }
    async resendVerificationEmail(email) {
        const user = await this.usersService.findByEmail(email);
        if (!user || user.emailVerified)
            return;
        await this.createAndSendVerificationEmail(user);
    }
    async sendPasswordResetEmail(email) {
        const user = await this.usersService.findByEmail(email);
        if (!user)
            return;
        await this.prisma.token.updateMany({
            where: {
                userId: user.id,
                type: client_1.TokenType.PASSWORD_RESET,
                usedAt: null,
            },
            data: { usedAt: new Date() },
        });
        const token = await this.prisma.token.create({
            data: {
                userId: user.id,
                type: client_1.TokenType.PASSWORD_RESET,
                token: (0, uuid_1.v4)(),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
        });
        await this.mailService.sendPasswordResetEmail(user.email, token.token);
    }
    async resetPassword(token, newPassword) {
        const tokenRecord = await this.prisma.token.findUnique({
            where: { token },
        });
        if (!tokenRecord ||
            tokenRecord.type !== client_1.TokenType.PASSWORD_RESET ||
            tokenRecord.usedAt ||
            tokenRecord.expiresAt < new Date()) {
            throw new common_1.BadRequestException("Invalid or expired password reset token.");
        }
        await this.prisma.token.update({
            where: { id: tokenRecord.id },
            data: { usedAt: new Date() },
        });
        await this.usersService.updatePassword(tokenRecord.userId, newPassword);
        await this.sessionsService.deleteAllUserSessions(tokenRecord.userId);
        return {
            message: "Password reset successful. Please log in with your new password.",
        };
    }
    async getSessions(userId) {
        return this.sessionsService.findAllByUserId(userId);
    }
    async revokeSession(userId, sessionId) {
        const session = await this.prisma.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== userId) {
            throw new common_1.NotFoundException("Session not found.");
        }
        await this.sessionsService.deleteSession(sessionId);
    }
    async revokeAllOtherSessions(userId, refreshToken) {
        let currentSessionId;
        if (refreshToken) {
            const session = await this.sessionsService.findByRefreshToken(refreshToken);
            currentSessionId = session?.id;
        }
        await this.sessionsService.deleteAllUserSessions(userId, currentSessionId);
    }
    async setup2FA(userId) {
        const user = await this.usersService.findById(userId);
        if (!user)
            throw new common_1.NotFoundException("User not found.");
        const secret = speakeasy.generateSecret({
            name: `AuthSystem (${user.email})`,
            issuer: "AuthSystem",
        });
        await this.usersService.update2FASecret(userId, secret.base32, false);
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        return {
            secret: secret.base32,
            qrCode: qrCodeUrl,
        };
    }
    async enable2FA(userId, totpCode) {
        const user = await this.usersService.findById(userId);
        if (!user || !user.twoFactorSecret) {
            throw new common_1.BadRequestException("Please set up 2FA first.");
        }
        const isValid = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: "base32",
            token: totpCode,
            window: 1,
        });
        if (!isValid) {
            throw new common_1.UnauthorizedException("Invalid verification code.");
        }
        await this.usersService.update2FASecret(userId, user.twoFactorSecret, true);
        const backupCodes = await this.generateBackupCodes(userId);
        return {
            message: "2FA enabled successfully.",
            backupCodes,
        };
    }
    async disable2FA(userId, totpCode) {
        const user = await this.usersService.findById(userId);
        if (!user || !user.twoFactorEnabled) {
            throw new common_1.BadRequestException("2FA is not enabled on this account.");
        }
        const isValid = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: "base32",
            token: totpCode,
            window: 1,
        });
        if (!isValid) {
            throw new common_1.UnauthorizedException("Invalid verification code.");
        }
        await this.usersService.update2FASecret(userId, null, false);
        await this.prisma.backupCode.deleteMany({ where: { userId } });
    }
    generateAccessToken(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled,
        };
        return this.jwtService.sign(payload, {
            secret: this.configService.get("JWT_ACCESS_SECRET"),
            expiresIn: this.configService.get("JWT_ACCESS_EXPIRES_IN"),
        });
    }
    sanitizeUser(user) {
        const { passwordHash, twoFactorSecret, ...safeUser } = user;
        return safeUser;
    }
    async createAndSendVerificationEmail(user) {
        await this.prisma.token.updateMany({
            where: {
                userId: user.id,
                type: client_1.TokenType.EMAIL_VERIFICATION,
                usedAt: null,
            },
            data: { usedAt: new Date() },
        });
        const token = await this.prisma.token.create({
            data: {
                userId: user.id,
                type: client_1.TokenType.EMAIL_VERIFICATION,
                token: (0, uuid_1.v4)(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        await this.mailService.sendVerificationEmail(user.email, token.token);
    }
    async generateBackupCodes(userId) {
        await this.prisma.backupCode.deleteMany({ where: { userId } });
        const codes = [];
        for (let i = 0; i < 8; i++) {
            const code = (0, uuid_1.v4)().replace(/-/g, "").substring(0, 8).toUpperCase();
            codes.push(code);
            const codeHash = await bcrypt.hash(code, 10);
            await this.prisma.backupCode.create({
                data: { userId, codeHash },
            });
        }
        return codes;
    }
    async verifyBackupCode(userId, code) {
        const backupCodes = await this.prisma.backupCode.findMany({
            where: { userId, usedAt: null },
        });
        for (const backupCode of backupCodes) {
            const isMatch = await bcrypt.compare(code, backupCode.codeHash);
            if (isMatch) {
                await this.prisma.backupCode.update({
                    where: { id: backupCode.id },
                    data: { usedAt: new Date() },
                });
                return true;
            }
        }
        return false;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        users_service_1.UsersService,
        sessions_service_1.SessionsService,
        jwt_1.JwtService,
        config_1.ConfigService,
        mail_service_1.MailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map