import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../access/access.service";
import type { EnsureUserResponse } from "@eon/shared-domain";

@Injectable()
export class TelegramUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  async ensure(telegramIdRaw: string, username?: string | null): Promise<EnsureUserResponse> {
    const trimmed = (telegramIdRaw ?? "").trim();
    if (!/^\d{1,20}$/.test(trimmed)) {
      throw new BadRequestException("telegramId must be a numeric string");
    }
    let telegramId: bigint;
    try {
      telegramId = BigInt(trimmed);
    } catch {
      throw new BadRequestException("invalid telegramId");
    }

    const uname = username === undefined || username === null || username === "" ? null : String(username);

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      create: { telegramId, username: uname },
      update: { ...(uname !== null ? { username: uname } : {}) },
      include: { entitlements: true }
    });

    return {
      userId: user.id,
      telegramId: String(user.telegramId),
      access: this.access.resolve(user)
    };
  }
}
