import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto, req: Request): Promise<{
        message: string;
        userId: string;
    }>;
    login(dto: LoginDto, req: Request, res: Response): Promise<{
        accessToken: string;
        user: {
            id: string;
            email: string;
            emailVerified: boolean;
            twoFactorEnabled: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    logout(req: Request, res: Response): Promise<void>;
    refresh(req: Request, res: Response): Promise<{
        accessToken: string;
    }>;
    verifyEmail(dto: VerifyEmailDto): Promise<{
        message: string;
    }>;
    resendVerification(dto: ResendVerificationDto): Promise<void>;
    forgotPassword(dto: ForgotPasswordDto): Promise<void>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    getSessions(req: Request): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        refreshToken: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastSeenAt: Date;
        expiresAt: Date;
    }[]>;
    revokeSession(id: string, req: Request): Promise<void>;
    revokeAllOtherSessions(req: Request): Promise<void>;
    setup2FA(req: Request): Promise<{
        secret: string;
        qrCode: string;
    }>;
    enable2FA(dto: Verify2FADto, req: Request): Promise<{
        message: string;
        backupCodes: string[];
    }>;
    disable2FA(dto: Verify2FADto, req: Request): Promise<void>;
}
