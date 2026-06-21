import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    createUser(email: string, password: string, name?: string): Promise<User>;
    createOAuthUser(email: string): Promise<User>;
    verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
    markEmailVerified(userId: string): Promise<User>;
    updatePassword(userId: string, newPassword: string): Promise<User>;
    update2FASecret(userId: string, secret: string | null, enabled: boolean): Promise<User>;
}
