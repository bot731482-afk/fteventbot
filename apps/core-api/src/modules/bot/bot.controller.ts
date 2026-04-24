import { Controller, Get } from "@nestjs/common";
import { FunTimeService } from "../funtime/funtime.service";
import type { BotConfigV1 } from "@eon/shared-domain";
import { BotConfigService } from "../bot-config/bot-config.service";

@Controller("bot")
export class BotController {
  constructor(
    private readonly funtimeService: FunTimeService,
    private readonly botConfigService: BotConfigService
  ) {}

  @Get("config")
  config(): Promise<BotConfigV1> {
    return this.botConfigService.getPublicConfig();
  }

  @Get("events/nearest")
  async nearestEvents(): Promise<object> {
    const items = await this.funtimeService.getNearestEvents(12);
    return { items };
  }
}
