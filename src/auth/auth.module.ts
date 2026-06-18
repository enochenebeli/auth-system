import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { SessionsService } from "./sessions.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";
import { UsersModule } from "../users/users.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    UsersModule,
    MailModule,
    // PassportModule registers Passport with NestJS dependency injection
    // 'jwt' is the default strategy — used when no strategy is named explicitly
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    // Register both strategies as providers so NestJS knows about them
    JwtStrategy,
    LocalStrategy,
  ],
  exports: [SessionsService],
})
export class AuthModule {}
