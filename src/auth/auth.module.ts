import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { SessionsService } from "./sessions.service";
import { UsersModule } from "../users/users.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [UsersModule, MailModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, SessionsService],
  exports: [SessionsService],
})
export class AuthModule {}
