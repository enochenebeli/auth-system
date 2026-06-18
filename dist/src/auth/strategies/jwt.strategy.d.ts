import { Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../../users/users.service";
interface JwtPayload {
    sub: string;
    email: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly configService;
    private readonly usersService;
    constructor(configService: ConfigService, usersService: UsersService);
    validate(payload: JwtPayload): Promise<{
        sub: string;
        email: string;
        emailVerified: boolean;
        twoFactorEnabled: boolean;
    }>;
}
export {};
