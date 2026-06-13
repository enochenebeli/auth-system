import { Injectable } from "@nestjs/common";

@Injectable()
export class MailService {
  // Stub — we will implement these properly in the next step
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    console.log(`[MAIL STUB] Verification email to ${email}, token: ${token}`);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    console.log(
      `[MAIL STUB] Password reset email to ${email}, token: ${token}`,
    );
  }

  async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    console.log(`[MAIL STUB] Magic link email to ${email}, token: ${token}`);
  }
}
