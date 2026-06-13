// This file defines the AuthController, which handles all authentication-related HTTP requests.
// It uses AuthService for the core business logic and SessionsService for session management.
// The controller defines routes for registration, login, logout, token refresh, email verification,
// password reset, and 2FA setup/verification. It also applies guards for rate limiting and
// authentication where appropriate.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — matches session expiry in SessionsService
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── REGISTER ──────────────────────────────────────────────────────
  // Rate-limited to prevent account enumeration at scale.
  // Returns the created user (without passwordHash) and a verification
  // notice — no tokens yet; user must verify email first.
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  // ─── LOGIN ─────────────────────────────────────────────────────────
  // Returns a short-lived access token in the response body and a
  // long-lived refresh token in an HttpOnly cookie.
  // If the account has 2FA enabled, dto.totpCode is required.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);

    return { accessToken: result.accessToken, user: result.user };
  }

  // ─── LOGOUT ────────────────────────────────────────────────────────
  // Deletes the session tied to the current refresh token and clears
  // the cookie. JWT guard ensures only authenticated users reach here.
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.logout(req.user['sub'], refreshToken);
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  }

  // ─── REFRESH TOKENS ────────────────────────────────────────────────
  // Reads the refresh token from the HttpOnly cookie, validates it,
  // rotates it (old one is invalidated), and returns a new access token.
  // The rotated refresh token is written back into the cookie.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    const result = await this.authService.refreshTokens(refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);

    return { accessToken: result.accessToken };
  }

  // ─── VERIFY EMAIL ──────────────────────────────────────────────────
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // ─── RESEND VERIFICATION EMAIL ─────────────────────────────────────
  // Rate-limited. Always returns 202 whether the email exists or not
  // to prevent user enumeration.
  @Post('resend-verification')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerificationEmail(dto.email);
  }

  // ─── FORGOT PASSWORD ───────────────────────────────────────────────
  // Rate-limited. Always returns 202 to prevent email enumeration.
  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.sendPasswordResetEmail(dto.email);
  }

  // ─── RESET PASSWORD ────────────────────────────────────────────────
  // Validates the one-time reset token from the email link, then
  // updates the password and invalidates all existing sessions.
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ─── LIST ACTIVE SESSIONS ──────────────────────────────────────────
  // Returns all unexpired sessions for the authenticated user — used
  // for the "active devices" dashboard.
  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  async getSessions(@Req() req: Request) {
    return this.authService.getSessions(req.user['sub']);
  }

  // ─── REVOKE A SINGLE SESSION ───────────────────────────────────────
  // User can revoke a specific device session from their dashboard.
  // Service verifies the session belongs to this user before deleting.
  @Delete('sessions/:id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@Param('id') id: string, @Req() req: Request) {
    await this.authService.revokeSession(req.user['sub'], id);
  }

  // ─── REVOKE ALL OTHER SESSIONS ─────────────────────────────────────
  // "Log out everywhere else" — deletes all sessions except the current
  // one identified by the refresh token cookie.
  @Delete('sessions')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllOtherSessions(@Req() req: Request) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.revokeAllOtherSessions(req.user['sub'], refreshToken);
  }

  // ─── SETUP 2FA ─────────────────────────────────────────────────────
  // Generates a TOTP secret and returns a QR code URL (via speakeasy +
  // qrcode). The secret is NOT saved until the user confirms with a
  // valid code via POST /auth/2fa/verify.
  @Post('2fa/setup')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async setup2FA(@Req() req: Request) {
    return this.authService.setup2FA(req.user['sub']);
  }

  // ─── ENABLE 2FA ────────────────────────────────────────────────────
  // Verifies the TOTP code against the pending secret, then persists
  // the secret and flips twoFactorEnabled = true. Also returns backup
  // codes the user should store safely.
  @Post('2fa/verify')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async enable2FA(@Body() dto: Verify2FADto, @Req() req: Request) {
    return this.authService.enable2FA(req.user['sub'], dto.code);
  }

  // ─── DISABLE 2FA ───────────────────────────────────────────────────
  // Requires a valid TOTP code to confirm the user has their
  // authenticator app before we remove 2FA protection.
  @Delete('2fa')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable2FA(@Body() dto: Verify2FADto, @Req() req: Request) {
    await this.authService.disable2FA(req.user['sub'], dto.code);
  }
}
