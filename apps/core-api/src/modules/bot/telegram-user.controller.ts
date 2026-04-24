import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { EnsureUserResponse } from "@eon/shared-domain";
import { BotServiceSecretGuard } from "./bot-service-secret.guard";
import { TelegramUserService } from "./telegram-user.service";

@Controller("bot/telegram")
@UseGuards(BotServiceSecretGuard)
export class TelegramUserController {
  constructor(private readonly telegramUser: TelegramUserService) {}

  @Post("ensure")
  async ensure(@Body() body: { telegramId?: string; username?: string | null }): Promise<EnsureUserResponse> {
    const tid = (body?.telegramId ?? "").toString();
    return this.telegramUser.ensure(tid, body?.username);
  }
}
