import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { BotServiceSecretGuard } from "./bot-service-secret.guard";
import { EventQueryService } from "./event-query.service";
import { NotificationOutboxService } from "./notification-outbox.service";
import { SchedulerTickService } from "./scheduler-tick.service";

@Controller("bot")
export class BotController {
  constructor(
    private readonly eventQuery: EventQueryService,
    private readonly outbox: NotificationOutboxService,
    private readonly tick: SchedulerTickService
  ) {}

  @Post("events/nearest")
  @UseGuards(BotServiceSecretGuard)
  async nearestForUser(@Body() body: { telegramId?: string }): Promise<object> {
    return this.eventQuery.getNearestForTelegramUser(body?.telegramId ?? "");
  }

  @Post("scheduler/tick")
  @UseGuards(BotServiceSecretGuard)
  async schedulerTick(): Promise<{
    enqueued: number;
    items: Array<{ id: string; telegramId: string; body: string; kind: string }>;
  }> {
    const enq = await this.tick.enqueueEventReminders();
    const items = await this.outbox.claimBatch(25);
    return { enqueued: enq.enqueued, items };
  }

  @Post("dispatch/ack")
  @UseGuards(BotServiceSecretGuard)
  async dispatchAck(
    @Body() body: { results?: Array<{ id: string; ok: boolean; error?: string }> }
  ): Promise<{ ok: true }> {
    for (const r of body?.results ?? []) {
      await this.outbox.ack(r.id, r.ok, r.error);
    }
    return { ok: true };
  }
}
