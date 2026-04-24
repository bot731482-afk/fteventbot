import { Injectable } from "@nestjs/common";
import { FunTimeService } from "../funtime/funtime.service";
import { BotConfigService } from "../bot-config/bot-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationOutboxService } from "./notification-outbox.service";

@Injectable()
export class SchedulerTickService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funtime: FunTimeService,
    private readonly botConfig: BotConfigService,
    private readonly outbox: NotificationOutboxService
  ) {}

  /**
   * Enqueue reminder outbox items from `UserNotification` + nearest snapshot (best-effort).
   */
  async enqueueEventReminders(): Promise<{ enqueued: number }> {
    const config = await this.botConfig.getPublicConfig();
    if (!config.flags.notificationsEnabled) {
      return { enqueued: 0 };
    }
    const rules = await this.prisma.userNotification.findMany({
      where: { isActive: true },
      include: { user: true }
    });
    if (!rules.length) {
      return { enqueued: 0 };
    }
    let enqueued = 0;
    const snapshot = await this.funtime.getSnapshotForRead();
    for (const rule of rules) {
      const u = rule.user;
      if (u.isBanned) {
        continue;
      }
      const block = snapshot.items.find((b) => b.server === rule.serverCode);
      if (!block?.events.length) {
        continue;
      }
      const nearest = Math.min(...block.events.map((e) => e.timeLeftSec));
      const within = rule.notifyBeforeMinutes * 60;
      if (nearest < 0 || nearest > within) {
        continue;
      }
      const bucket = Math.floor(Math.max(0, nearest) / 300);
      const dedupeKey = `remind:${u.id}:${rule.serverCode}:${bucket}`;
      const body = `Скоро ивент: ${block.server} (~${Math.max(1, Math.ceil(nearest / 60))} мин)`;
      const created = await this.outbox.tryEnqueue({
        userId: u.id,
        telegramId: u.telegramId,
        dedupeKey,
        body,
        kind: "event_reminder"
      });
      if (created) {
        enqueued += 1;
      }
    }
    return { enqueued };
  }
}
