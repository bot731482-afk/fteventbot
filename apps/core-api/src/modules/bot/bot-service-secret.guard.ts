import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

@Injectable()
export class BotServiceSecretGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const expected = (process.env.BOT_SERVICE_SECRET ?? "").trim();
    if (!expected) {
      throw new ServiceUnavailableException("BOT_SERVICE_SECRET is not configured");
    }
    const header = (req.headers["x-bot-service-secret"] ?? "").toString().trim();
    if (!header || !safeEqualString(header, expected)) {
      throw new UnauthorizedException("Invalid bot service secret");
    }
    return true;
  }
}
