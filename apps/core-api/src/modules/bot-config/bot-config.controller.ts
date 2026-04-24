import { BadRequestException, Body, Controller, Get, Headers, Inject, NotFoundException, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { validateBotConfigV1, type BotConfigV1 } from "@eon/shared-domain";
import { BotConfigService } from "./bot-config.service";
import type { BotConfigHistoryEntry } from "./bot-config.store";

type AdminBotConfigView = { config: BotConfigV1; history: BotConfigHistoryEntry[] };
type UpdateBotConfigResult = { ok: true; id: string };
type RollbackBotConfigResult = { ok: true };
type RollbackBody = { id?: string };

@Controller("admin/bot-config")
export class AdminBotConfigController {
  constructor(@Inject(BotConfigService) private readonly service: BotConfigService) {}

  private assertOwner(ownerAdminId?: string): void {
    if (!ownerAdminId || ownerAdminId !== process.env.OWNER_ADMIN_ID) {
      throw new UnauthorizedException("Owner access only");
    }
  }

  @Get()
  get(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<AdminBotConfigView> {
    this.assertOwner(ownerAdminId);
    return this.service.getAdminView();
  }

  @Patch()
  patch(@Headers("x-owner-admin-id") ownerAdminId?: string, @Body() body?: unknown): Promise<UpdateBotConfigResult> {
    this.assertOwner(ownerAdminId);
    try {
      const validated = validateBotConfigV1(body);
      return this.service.updateConfig(validated);
    } catch (error) {
      throw new BadRequestException(`Invalid BotConfigV1 payload: ${String(error)}`);
    }
  }

  @Post("rollback")
  async rollback(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Body() body?: RollbackBody
  ): Promise<RollbackBotConfigResult> {
    this.assertOwner(ownerAdminId);
    const id = String(body?.id ?? "").trim();
    if (!id) {
      throw new BadRequestException("Rollback id is required");
    }
    try {
      return await this.service.rollback(id);
    } catch (error) {
      const msg = String(error);
      if (msg.includes("Rollback snapshot not found")) {
        throw new NotFoundException(msg);
      }
      if (msg.includes("Invalid rollback id")) {
        throw new BadRequestException(msg);
      }
      throw error;
    }
  }
}

@Controller("bot")
export class PublicBotConfigController {
  constructor(@Inject(BotConfigService) private readonly service: BotConfigService) {}

  @Get("config")
  getConfig(): Promise<BotConfigV1> {
    return this.service.getPublicConfig();
  }
}

