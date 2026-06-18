import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../../users/users.service";

// The shape of data we encoded into the JWT when we created it.
// Must match the JwtPayload interface in auth.service.ts exactly.
interface JwtPayload {
  sub: string; // user ID
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      // Tell Passport WHERE to look for the JWT in incoming requests.
      // We're using Bearer token in the Authorization header:
      // Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // If the token is expired, reject it immediately — don't even
      // call validate(). Passport handles this automatically.
      ignoreExpiration: false,

      // The secret used to VERIFY the signature. Must match the secret
      // used to SIGN the token in auth.service.ts generateAccessToken().
      secretOrKey: configService.get<string>("JWT_ACCESS_SECRET"),
    });
  }

  // ─── VALIDATE ──────────────────────────────────────────────────────
  // Passport calls this automatically after verifying the JWT signature.
  // Whatever we return here gets attached to req.user in the controller.
  // So when a controller does req.user['sub'], it gets the user ID.
  //
  // We also re-fetch the user from the DB here to make sure:
  // 1. The user still exists (wasn't deleted after the token was issued)
  // 2. We have fresh data (emailVerified status etc.)
  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      // User was deleted after the token was issued
      throw new UnauthorizedException("User no longer exists.");
    }

    // This object becomes req.user in every protected controller method
    return {
      sub: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    };
  }
}
