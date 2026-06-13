import { PrismaService } from '../prisma/prisma.service';
import { Session } from '@prisma/client';
export declare class SessionsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createSession(userId: string, userAgent: string | undefined, ipAddress: string | undefined): Promise<Session>;
    findByRefreshToken(refreshToken: string): Promise<Session | null>;
    rotateRefreshToken(sessionId: string): Promise<Session>;
    findAllByUserId(userId: string): Promise<Session[]>;
    deleteSession(sessionId: string): Promise<void>;
    deleteAllUserSessions(userId: string, excludeSessionId?: string): Promise<void>;
    isSessionExpired(session: Session): boolean;
}
