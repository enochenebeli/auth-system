export declare class MailService {
    sendVerificationEmail(email: string, token: string): Promise<void>;
    sendPasswordResetEmail(email: string, token: string): Promise<void>;
    sendMagicLinkEmail(email: string, token: string): Promise<void>;
}
