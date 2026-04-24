import { Controller, Get } from "@nestjs/common";
import { FunTimeService } from "../funtime/funtime.service";

@Controller("bot")
export class BotController {
  constructor(private readonly funtimeService: FunTimeService) {}

  @Get("events/nearest")
  async nearestEvents(): Promise<object> {
    const items = await this.funtimeService.getNearestEvents(12);
    return { items };
  }
}
