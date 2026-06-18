import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { SessionsService } from "./sessions.service";
import { MailService } from "../mail/mail.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
interface RequestMetadata {
    userAgent: string | undefined;
    ipAddress: string | undefined;
}
export declare class AuthService {
    private readonly prisma;
    private readonly usersService;
    private readonly sessionsService;
    private readonly jwtService;
    private readonly configService;
    private readonly mailService;
    constructor(prisma: PrismaService, usersService: UsersService, sessionsService: SessionsService, jwtService: JwtService, configService: ConfigService, mailService: MailService);
    register(dto: RegisterDto, meta: RequestMetadata): Promise<{
        message: string;
        userId: string;
    }>;
    login(dto: LoginDto, meta: RequestMetadata): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            emailVerified: boolean;
            twoFactorEnabled: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    logout(userId: string, refreshToken: string | undefined): Promise<void>;
    refreshTokens(refreshToken: string | undefined, meta: RequestMetadata): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    resendVerificationEmail(email: string): Promise<void>;
    sendPasswordResetEmail(email: string): Promise<void>;
    resetPassword(token: string, newPassword: string): Promise<{
        message: string;
    }>;
    getSessions(userId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        refreshToken: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastSeenAt: Date;
        expiresAt: Date;
    }[]>;
    revokeSession(userId: string, sessionId: string): Promise<void>;
    revokeAllOtherSessions(userId: string, refreshToken: string | undefined): Promise<void>;
    setup2FA(userId: string): Promise<{
        secret: string;
        qrCode: string;
    }>;
    enable2FA(userId: string, totpCode: string): Promise<{
        message: string;
        backupCodes: string[];
    }>;
    disable2FA(userId: string, totpCode: string): Promise<void>;
    private generateAccessToken;
    private sanitizeUser;
    private createAndSendVerificationEmail;
    private generateBackupCodes;
    private verifyBackupCode;
}
export {};
