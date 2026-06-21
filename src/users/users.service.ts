import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  // PrismaService is injected here — this is NestJS dependency injection.
  // Instead of creating a new PrismaService() manually, NestJS handles
  // that for us and passes it in automatically.
  constructor(private readonly prisma: PrismaService) {}

  // ─── FIND USER BY EMAIL ───────────────────────────────────────────
  // Used during login to check if a user with this email exists.
  // Returns the full user object or null if not found.
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // ─── FIND USER BY ID ──────────────────────────────────────────────
  // Used when we have a userId from a JWT token and need the full user.
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  // ─── CREATE USER ──────────────────────────────────────────────────
  // Called during registration. We never store plain text passwords —
  // bcrypt hashes the password with a cost factor of 12. The higher
  // the cost factor, the harder it is to brute force. 12 is the
  // industry standard for production apps.
  async createUser(email: string, password: string, name?: string): Promise<User> {
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    return this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });
  }

  // ─── CREATE OAUTH USER ────────────────────────────────────────────
  // When a user signs in with Google or GitHub for the first time,
  // we create a user without a password (they don't have one).
  // We also mark their email as verified since OAuth providers
  // already verified it for us.
  async createOAuthUser(email: string): Promise<User> {
    return this.prisma.user.create({
      data: {
        email,
        emailVerified: true, // OAuth providers already verified the email
        passwordHash: null,  // No password — they login via OAuth only
      },
    });
  }

  // ─── VERIFY PASSWORD ──────────────────────────────────────────────
  // During login, we compare the plain text password the user typed
  // against the hash stored in the database. bcrypt.compare handles
  // this safely — we never decrypt the hash, we just compare.
  async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  // ─── MARK EMAIL AS VERIFIED ───────────────────────────────────────
  // Called after a user clicks the verification link in their email.
  async markEmailVerified(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  // ─── UPDATE PASSWORD ──────────────────────────────────────────────
  // Called during password reset flow. Always hash before storing.
  async updatePassword(userId: string, newPassword: string): Promise<User> {
    const passwordHash = await bcrypt.hash(newPassword, 12);

    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // ─── UPDATE 2FA SECRET ────────────────────────────────────────────
  // When a user sets up 2FA, we store their TOTP secret in the DB.
  // We also toggle twoFactorEnabled on or off.
  async update2FASecret(
    userId: string,
    secret: string | null,
    enabled: boolean,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: enabled,
      },
    });
  }
}