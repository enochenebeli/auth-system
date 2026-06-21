import { ConfigService } from '@nestjs/config';
export declare class MailService {
    private readonly config;
    private readonly logger;
    private readonly resend;
    private readonly from;
    private readonly frontendUrl;
    constructor(config: ConfigService);
    sendVerificationEmail(email: string, token: string): Promise<void>;
    sendPasswordResetEmail(email: string, token: string): Promise<void>;
    sendMagicLinkEmail(email: string, token: string): Promise<void>;
    private send;
    private verificationTemplate;
    private passwordResetTemplate;
    private magicLinkTemplate;
    private wrap;
}
