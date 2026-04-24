import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import { BotConfigService } from "../bot-config/bot-config.service";
import { FunTimeService } from "../funtime/funtime.service";
import { PrismaService } from "../prisma/prisma.service";

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class EventQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly funtime: FunTimeService,
    private readonly botConfig: BotConfigService
  ) {}

  async getNearestForTelegramUser(telegramIdRaw: string): Promise<{ items: Awaited<ReturnType<FunTimeService["getNearestEvents"]>> }> {
    const t = (telegramIdRaw ?? "").trim();
    if (!/^\d{1,20}$/.test(t)) {
      throw new HttpException("telegramId is required (numeric string)", HttpStatus.BAD_REQUEST);
    }
    const telegramId = BigInt(t);
    const config = await this.botConfig.getPublicConfig();
    const cooldownMs = Math.max(0, Number(config.limits.cooldownSeconds) || 0) * 1000;
    const dailyMax = Math.max(0, Number(config.limits.dailyEventViewsMax) || 0);

    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.upsert({
        where: { telegramId },
        create: { telegramId, username: null },
        update: {},
        include: { entitlements: true }
      });
      const access = this.access.resolve(u);
      if (!access.canViewEvents) {
        throw new HttpException({ denied: { reason: "NO_ACCESS" } }, HttpStatus.FORBIDDEN);
      }
      if (u.lastEventQueryAt) {
        const since = Date.now() - u.lastEventQueryAt.getTime();
        if (cooldownMs > 0 && since < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - since) / 1000);
          throw new HttpException(
            { denied: { reason: "COOLDOWN", waitSec } },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
      }
      const needDaily = access.tier === "free" || access.tier === "trial";
      if (needDaily && dailyMax > 0) {
        const day = utcDayStart();
        const row = await tx.eventDailyUsage.findUnique({
          where: { userId_dayUtc: { userId: u.id, dayUtc: day } }
        });
        if ((row?.count ?? 0) >= dailyMax) {
          throw new HttpException({ denied: { reason: "DAILY_LIMIT" } }, HttpStatus.TOO_MANY_REQUESTS);
        }
        await tx.eventDailyUsage.upsert({
          where: { userId_dayUtc: { userId: u.id, dayUtc: day } },
          create: { userId: u.id, dayUtc: day, count: 1 },
          update: { count: { increment: 1 } }
        });
      }
      await tx.user.update({
        where: { id: u.id },
        data: { lastEventQueryAt: new Date() }
      });
    });

    const items = await this.funtime.getNearestEvents(12);
    return { items };
  }
}
