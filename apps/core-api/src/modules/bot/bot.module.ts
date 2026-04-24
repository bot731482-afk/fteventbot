import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { BotConfigModule } from "../bot-config/bot-config.module";
import { FunTimeModule } from "../funtime/funtime.module";
import { BotController } from "./bot.controller";
import { BotServiceSecretGuard } from "./bot-service-secret.guard";
import { EventQueryService } from "./event-query.service";
import { NotificationOutboxService } from "./notification-outbox.service";
import { SchedulerTickService } from "./scheduler-tick.service";
import { TelegramUserController } from "./telegram-user.controller";
import { TelegramUserService } from "./telegram-user.service";

@Module({
  imports: [FunTimeModule, AccessModule, BotConfigModule],
  controllers: [BotController, TelegramUserController],
  providers: [
    TelegramUserService,
    BotServiceSecretGuard,
    EventQueryService,
    NotificationOutboxService,
    SchedulerTickService
  ]
})
export class BotModule {}
