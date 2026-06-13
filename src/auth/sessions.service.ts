import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Session } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CREATE SESSION ───────────────────────────────────────────────
  // Called every time a user logs in successfully.
  // Each session gets a unique refresh token (a UUID).
  // We store the device info (userAgent) and IP so the user can
  // see "Chrome on Windows" in their active sessions dashboard.
  async createSession(
    userId: string,
    userAgent: string | undefined,
    ipAddress: string | undefined,
  ): Promise<Session> {
    // Generate a unique token for this session
    // UUID v4 is random and cryptographically strong enough for this
    const refreshToken = uuidv4();

    // Refresh tokens expire in 7 days from now
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

  // ─── FIND SESSION BY REFRESH TOKEN ───────────────────────────────
  // Called when the frontend sends a refresh token to get a new
  // access token. We look up the session to verify it's valid.
  async findByRefreshToken(refreshToken: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { refreshToken },
    });
  }

  // ─── ROTATE REFRESH TOKEN ─────────────────────────────────────────
  // This is the security core of our auth system.
  // Every time a refresh token is used, we REPLACE it with a new one.
  // This is called "refresh token rotation".
  //
  // Why? If an attacker steals your refresh token and uses it,
  // the legitimate user's next request will fail (token already rotated),
  // alerting us to a potential breach. We can then revoke all sessions.
  async rotateRefreshToken(sessionId: string): Promise<Session> {
    const newRefreshToken = uuidv4();

    // Extend expiry by another 7 days on each rotation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        refreshToken: newRefreshToken,
        lastSeenAt: new Date(), // Update "last seen" timestamp
        expiresAt,
      },
    });
  }

  // ─── GET ALL SESSIONS FOR USER ────────────────────────────────────
  // Returns every active session — used for the "active devices"
  // dashboard where the user can see and revoke sessions.
  async findAllByUserId(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        userId,
        // Only return sessions that haven't expired yet
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' }, // Most recently active first
    });
  }

  // ─── DELETE ONE SESSION ───────────────────────────────────────────
  // Called when user logs out from a specific device, or revokes
  // a session from their active devices dashboard.
  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.session.delete({
      where: { id: sessionId },
    });
  }

  // ─── DELETE ALL SESSIONS FOR USER ────────────────────────────────
  // Called when user clicks "logout from all devices".
  // The excludeSessionId param lets us keep the current session alive
  // if the user only wants to log out OTHER devices.
  async deleteAllUserSessions(
    userId: string,
    excludeSessionId?: string,
  ): Promise<void> {
    await this.prisma.session.deleteMany({
      where: {
        userId,
        // If excludeSessionId is provided, skip that one
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
    });
  }

  // ─── CHECK IF SESSION IS EXPIRED ─────────────────────────────────
  // A helper to validate a session before trusting its refresh token.
  isSessionExpired(session: Session): boolean {
    return session.expiresAt < new Date();
  }
}