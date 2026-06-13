import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from './sessions.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TokenType, User } from '@prisma/client';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Shape of the JWT payload we encode into every access token
interface JwtPayload {
  sub: string;       // subject — the user's ID
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

// Metadata we extract from every request for session tracking
interface RequestMetadata {
  userAgent: string | undefined;
  ipAddress: string | undefined;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ─── REGISTER ──────────────────────────────────────────────────────
  // Creates a new user, sends a verification email, but does NOT
  // issue tokens yet. User must verify their email before logging in.
  async register(dto: RegisterDto, meta: RequestMetadata) {
    // createUser handles duplicate email check + bcrypt hashing
    const user = await this.usersService.createUser(dto.email, dto.password);

    // Generate a secure one-time token for email verification
    await this.createAndSendVerificationEmail(user);

    return {
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
    };
  }

  // ─── LOGIN ─────────────────────────────────────────────────────────
  // Validates credentials, checks 2FA if enabled, creates a session,
  // and returns both an access token and a refresh token.
  async login(dto: LoginDto, meta: RequestMetadata) {
    // Step 1 — find the user
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      // We throw the same error whether email or password is wrong.
      // This prevents attackers from knowing which one failed
      // (called "user enumeration prevention").
      throw new UnauthorizedException('Invalid email or password');
    }

    // Step 2 — verify password
    // Users who registered via OAuth have no password
    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses social login. Please sign in with Google or GitHub.');
    }

    const passwordValid = await this.usersService.verifyPassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Step 3 — check email verification
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in.');
    }

    // Step 4 — check 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException('Two-factor authentication code is required.');
      }

      const isValidTotp = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: dto.totpCode,
        window: 1, // Allow 1 step before/after for clock drift
      });

      if (!isValidTotp) {
        // Try backup codes if TOTP fails
        const backupValid = await this.verifyBackupCode(user.id, dto.totpCode);
        if (!backupValid) {
          throw new UnauthorizedException('Invalid two-factor authentication code.');
        }
      }
    }

    // Step 5 — create a session and issue tokens
    const session = await this.sessionsService.createSession(
      user.id,
      meta.userAgent,
      meta.ipAddress,
    );

    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: session.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  // ─── LOGOUT ────────────────────────────────────────────────────────
  // Deletes the session tied to this refresh token.
  // Even if the token is missing, we return success — idempotent logout.
  async logout(userId: string, refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    const session = await this.sessionsService.findByRefreshToken(refreshToken);

    // Only delete if the session belongs to this user (security check)
    if (session && session.userId === userId) {
      await this.sessionsService.deleteSession(session.id);
    }
  }

  // ─── REFRESH TOKENS ────────────────────────────────────────────────
  // The frontend calls this when the access token expires (every 15min).
  // We validate the refresh token, rotate it, and issue a new access token.
  async refreshTokens(
    refreshToken: string | undefined,
    meta: RequestMetadata,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided.');
    }

    // Look up the session
    const session = await this.sessionsService.findByRefreshToken(refreshToken);

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Check expiry
    if (this.sessionsService.isSessionExpired(session)) {
      await this.sessionsService.deleteSession(session.id);
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    // Get the user this session belongs to
    const user = await this.usersService.findById(session.userId);

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    // Rotate the refresh token — old one is now invalid
    const rotatedSession = await this.sessionsService.rotateRefreshToken(session.id);

    // Generate a fresh access token
    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: rotatedSession.refreshToken,
    };
  }

  // ─── VERIFY EMAIL ──────────────────────────────────────────────────
  // Called when the user clicks the link in their verification email.
  // The token is single-use and expires after 24 hours.
  async verifyEmail(token: string) {
    const tokenRecord = await this.prisma.token.findUnique({
      where: { token },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.EMAIL_VERIFICATION) {
      throw new BadRequestException('Invalid or expired verification token.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired. Please request a new one.');
    }

    if (tokenRecord.usedAt) {
      throw new BadRequestException('This verification link has already been used.');
    }

    // Mark the token as used (single-use enforcement)
    await this.prisma.token.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Mark the user's email as verified
    await this.usersService.markEmailVerified(tokenRecord.userId);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ─── RESEND VERIFICATION EMAIL ─────────────────────────────────────
  // Always returns success even if the email doesn't exist — prevents
  // attackers from discovering which emails are registered.
  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    // Silently return if user not found or already verified
    if (!user || user.emailVerified) return;

    await this.createAndSendVerificationEmail(user);
  }

  // ─── FORGOT PASSWORD ───────────────────────────────────────────────
  async sendPasswordResetEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    // Silently return — same enumeration prevention as above
    if (!user) return;

    // Expire any existing reset tokens for this user
    await this.prisma.token.updateMany({
      where: {
        userId: user.id,
        type: TokenType.PASSWORD_RESET,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Create a fresh reset token valid for 1 hour
    const token = await this.prisma.token.create({
      data: {
        userId: user.id,
        type: TokenType.PASSWORD_RESET,
        token: uuidv4(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    await this.mailService.sendPasswordResetEmail(user.email, token.token);
  }

  // ─── RESET PASSWORD ────────────────────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const tokenRecord = await this.prisma.token.findUnique({
      where: { token },
    });

    if (
      !tokenRecord ||
      tokenRecord.type !== TokenType.PASSWORD_RESET ||
      tokenRecord.usedAt ||
      tokenRecord.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    // Mark token as used before changing password (prevents race conditions)
    await this.prisma.token.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Update the password
    await this.usersService.updatePassword(tokenRecord.userId, newPassword);

    // Invalidate ALL sessions — if someone's account was compromised,
    // resetting the password should log out every active session
    await this.sessionsService.deleteAllUserSessions(tokenRecord.userId);

    return { message: 'Password reset successful. Please log in with your new password.' };
  }

  // ─── GET SESSIONS ──────────────────────────────────────────────────
  async getSessions(userId: string) {
    return this.sessionsService.findAllByUserId(userId);
  }

  // ─── REVOKE SESSION ────────────────────────────────────────────────
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    // Verify the session belongs to this user before deleting
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found.');
    }

    await this.sessionsService.deleteSession(sessionId);
  }

  // ─── REVOKE ALL OTHER SESSIONS ─────────────────────────────────────
  async revokeAllOtherSessions(
    userId: string,
    refreshToken: string | undefined,
  ): Promise<void> {
    let currentSessionId: string | undefined;

    if (refreshToken) {
      const session = await this.sessionsService.findByRefreshToken(refreshToken);
      currentSessionId = session?.id;
    }

    // Delete all sessions except the current one
    await this.sessionsService.deleteAllUserSessions(userId, currentSessionId);
  }

  // ─── SETUP 2FA ─────────────────────────────────────────────────────
  // Generates a TOTP secret and QR code. We store the secret temporarily
  // in the DB but don't enable 2FA until the user confirms with a valid code.
  async setup2FA(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) throw new NotFoundException('User not found.');

    // Generate a new TOTP secret
    const secret = speakeasy.generateSecret({
      name: `AuthSystem (${user.email})`, // Label shown in authenticator app
      issuer: 'AuthSystem',
    });

    // Store the secret temporarily (enabled = false until verified)
    await this.usersService.update2FASecret(userId, secret.base32, false);

    // Generate QR code as a data URL the frontend can display as an <img>
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,  // User can manually enter this if QR fails
      qrCode: qrCodeUrl,
    };
  }

  // ─── ENABLE 2FA ────────────────────────────────────────────────────
  // Verifies the code from the authenticator app, then officially
  // enables 2FA and generates backup codes.
  async enable2FA(userId: string, totpCode: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('Please set up 2FA first.');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code.');
    }

    // Officially enable 2FA
    await this.usersService.update2FASecret(userId, user.twoFactorSecret, true);

    // Generate 8 backup codes
    const backupCodes = await this.generateBackupCodes(userId);

    return {
      message: '2FA enabled successfully.',
      // Show backup codes ONCE — user must save these
      backupCodes,
    };
  }

  // ─── DISABLE 2FA ───────────────────────────────────────────────────
  async disable2FA(userId: string, totpCode: string): Promise<void> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled on this account.');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code.');
    }

    // Clear the secret and disable 2FA
    await this.usersService.update2FASecret(userId, null, false);

    // Delete all backup codes
    await this.prisma.backupCode.deleteMany({ where: { userId } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS — not exposed as endpoints
  // ═══════════════════════════════════════════════════════════════════

  // Generates a signed JWT access token for a user.
  // Access tokens are short-lived (15 min) — this limits damage
  // if one is stolen since it expires quickly.
  private generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    };
    
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN') as any,
    });
  }

  // Strips sensitive fields before returning user data to the frontend.
  // We NEVER send passwordHash, twoFactorSecret, etc. to the client.
  private sanitizeUser(user: User) {
    const { passwordHash, twoFactorSecret, ...safeUser } = user;
    return safeUser;
  }

  // Creates an email verification token and sends the email.
  private async createAndSendVerificationEmail(user: User): Promise<void> {
    // Invalidate any existing unused verification tokens
    await this.prisma.token.updateMany({
      where: {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Create a new token valid for 24 hours
    const token = await this.prisma.token.create({
      data: {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        token: uuidv4(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.mailService.sendVerificationEmail(user.email, token.token);
  }

  // Generates 8 backup codes, hashes them, stores the hashes.
  // Returns the plain codes ONCE so the user can save them.
  private async generateBackupCodes(userId: string): Promise<string[]> {
    // Delete any existing backup codes first
    await this.prisma.backupCode.deleteMany({ where: { userId } });

    const codes: string[] = [];

    for (let i = 0; i < 8; i++) {
      // Generate a random 8-character alphanumeric code
      const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      codes.push(code);

      // Hash before storing — same principle as passwords
      const codeHash = await bcrypt.hash(code, 10);

      await this.prisma.backupCode.create({
        data: { userId, codeHash },
      });
    }

    return codes;
  }

  // Checks if a submitted code matches any unused backup code.
  // Burns the code on use (single-use).
  private async verifyBackupCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const backupCodes = await this.prisma.backupCode.findMany({
      where: { userId, usedAt: null },
    });

    for (const backupCode of backupCodes) {
      const isMatch = await bcrypt.compare(code, backupCode.codeHash);

      if (isMatch) {
        // Mark this backup code as used
        await this.prisma.backupCode.update({
          where: { id: backupCode.id },
          data: { usedAt: new Date() },
        });
        return true;
      }
    }

    return false;
  }
}
