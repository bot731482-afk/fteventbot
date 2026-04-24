import { Body, Controller, Get, Headers, Patch, Post, UnauthorizedException } from "@nestjs/common";
import type { BotConfigV1 } from "@eon/shared-domain";
import { BotConfigService } from "./bot-config.service";

@Controller("admin/bot-config")
export class AdminBotConfigController {
  constructor(private readonly service: BotConfigService) {}

  private assertOwner(ownerAdminId?: string): void {
    if (!ownerAdminId || ownerAdminId !== process.env.OWNER_ADMIN_ID) {
      throw new UnauthorizedException("Owner access only");
    }
  }

  @Get()
  get(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    return this.service.getAdminView();
  }

  @Patch()
  patch(@Headers("x-owner-admin-id") ownerAdminId?: string, @Body() body?: BotConfigV1): Promise<object> {
    this.assertOwner(ownerAdminId);
    return this.service.updateConfig(body as BotConfigV1);
  }

  @Post("rollback")
  rollback(@Headers("x-owner-admin-id") ownerAdminId?: string, @Body() body?: { id?: string }): Promise<object> {
    this.assertOwner(ownerAdminId);
    return this.service.rollback(body?.id ?? "");
  }
}

@Controller("bot")
export class PublicBotConfigController {
  constructor(private readonly service: BotConfigService) {}

  @Get("config")
  getConfig(): Promise<BotConfigV1> {
    return this.service.getPublicConfig();
  }
}

