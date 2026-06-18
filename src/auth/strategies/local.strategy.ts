import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { UsersService } from "../../users/users.service";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, "local") {
  constructor(private readonly usersService: UsersService) {
    super({
      // Tell passport-local to use 'email' instead of the default
      // 'username' field when reading the request body
      usernameField: "email",
    });
  }

  // ─── VALIDATE ──────────────────────────────────────────────────────
  // Passport calls this when someone hits a route protected by
  // AuthGuard('local'). We verify the credentials here.
  // If valid, the returned value is attached to req.user.
  async validate(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const isValid = await this.usersService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!isValid) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    return user;
  }
}
