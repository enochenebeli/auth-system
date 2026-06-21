import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = this.config.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/verify-email?token=${token}`;

    await this.send({
      to: email,
      subject: 'Verify your email address',
      html: this.verificationTemplate(link),
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/reset-password?token=${token}`;

    await this.send({
      to: email,
      subject: 'Reset your password',
      html: this.passwordResetTemplate(link),
    });
  }

  async sendMagicLinkEmail(email: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/magic-link?token=${token}`;

    await this.send({
      to: email,
      subject: 'Your magic sign-in link',
      html: this.magicLinkTemplate(link),
    });
  }

  // ─── PRIVATE ───────────────────────────────────────────────────────

  private async send(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      this.logger.error(`Failed to send email to ${params.to}`, error);
      throw new Error(`Email send failed: ${error.message}`);
    }

    this.logger.log(`Email sent to ${params.to} — "${params.subject}"`);
  }

  // ─── TEMPLATES ─────────────────────────────────────────────────────

  private verificationTemplate(link: string): string {
    return this.wrap({
      title: 'Verify your email',
      body: `
        <p style="margin:0 0 16px">Thanks for signing up. Click the button below to verify your email address.</p>
        <p style="margin:0 0 16px">This link expires in <strong>24 hours</strong>.</p>
      `,
      buttonText: 'Verify email',
      buttonLink: link,
      footer: "If you didn't create an account, you can safely ignore this email.",
    });
  }

  private passwordResetTemplate(link: string): string {
    return this.wrap({
      title: 'Reset your password',
      body: `
        <p style="margin:0 0 16px">We received a request to reset your password. Click the button below to choose a new one.</p>
        <p style="margin:0 0 16px">This link expires in <strong>1 hour</strong>.</p>
      `,
      buttonText: 'Reset password',
      buttonLink: link,
      footer: "If you didn't request a password reset, you can safely ignore this email.",
    });
  }

  private magicLinkTemplate(link: string): string {
    return this.wrap({
      title: 'Your sign-in link',
      body: `
        <p style="margin:0 0 16px">Click the button below to sign in. No password needed.</p>
        <p style="margin:0 0 16px">This link expires in <strong>15 minutes</strong> and can only be used once.</p>
      `,
      buttonText: 'Sign in',
      buttonLink: link,
      footer: "If you didn't request this link, you can safely ignore this email.",
    });
  }

  private wrap(params: {
    title: string;
    body: string;
    buttonText: string;
    buttonLink: string;
    footer: string;
  }): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:32px 40px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Auth System</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:600;color:#18181b;letter-spacing:-0.3px;">${params.title}</h1>
              <div style="font-size:15px;line-height:1.6;color:#52525b;">
                ${params.body}
              </div>
              <a href="${params.buttonLink}"
                 style="display:inline-block;margin-top:8px;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
                ${params.buttonText}
              </a>
              <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;">
                Or copy this link into your browser:<br/>
                <span style="color:#71717a;word-break:break-all;">${params.buttonLink}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">${params.footer}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}
