import { Controller, Get } from "@nestjs/common";
import { FunTimeService } from "../funtime/funtime.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("bot")
export class BotController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funtimeService: FunTimeService
  ) {}

  @Get("config")
  async config(): Promise<object> {
    const [contentBlocks, channels, flags] = await Promise.all([
      this.prisma.contentBlock.findMany({ where: { locale: "ru" } }),
      this.prisma.requiredChannel.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
      this.prisma.featureFlag.findMany()
    ]);

    const content = contentBlocks.reduce<Record<string, string>>((acc, item) => {
      acc[item.key] = item.text;
      return acc;
    }, {});
    const menuButtons = (content["menu.buttons"] ?? "Ближайшие ивенты\nУведомить меня\nПрофиль\nКупить доступ")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      content,
      menuButtons,
      channels,
      flags: flags.reduce<Record<string, boolean>>((acc, flag) => {
        acc[flag.key] = flag.enabled;
        return acc;
      }, {})
    };
  }

  @Get("events/nearest")
  async nearestEvents(): Promise<object> {
    const items = await this.funtimeService.getNearestEvents(12);
    return { items };
  }
}
