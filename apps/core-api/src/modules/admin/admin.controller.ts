import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { PlanKind } from "@prisma/client";
import { FunTimeService } from "../funtime/funtime.service";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly funtimeService: FunTimeService,
    private readonly adminService: AdminService
  ) {}

  private assertOwner(ownerAdminId?: string): string {
    if (!ownerAdminId || ownerAdminId !== process.env.OWNER_ADMIN_ID) {
      throw new UnauthorizedException("Owner access only");
    }
    return ownerAdminId;
  }

  @Get("dashboard")
  async dashboard(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    const base = await this.adminService.getDashboard();
    const nearest = await this.funtimeService.getNearestEvents(5);
    return {
      ...base,
      previewNearestEvents: nearest
    };
  }

  @Get("users")
  users(@Headers("x-owner-admin-id") ownerAdminId?: string): object {
    this.assertOwner(ownerAdminId);
    return { items: [] };
  }

  @Patch("users/:id/unlimited")
  grantUnlimited(@Headers("x-owner-admin-id") ownerAdminId?: string): object {
    this.assertOwner(ownerAdminId);
    return { ok: true, action: "grant_unlimited_lifetime" };
  }

  @Get("plans")
  async plans(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    return { items: await this.adminService.listPlans() };
  }

  @Post("plans")
  createPlan(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Body()
    body?: { code: string; title: string; kind: PlanKind; price: number; viewsAmount?: number | null; enabled?: boolean }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.createPlan({ actor }, body ?? { code: "", title: "", kind: "VIEWS", price: 0 });
  }

  @Patch("plans/:code")
  updatePlan(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Param("code") code?: string,
    @Body() body?: { title?: string; kind?: PlanKind; price?: number; viewsAmount?: number | null; enabled?: boolean }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.updatePlan({ actor }, code ?? "", body ?? {});
  }

  @Delete("plans/:code")
  deletePlan(@Headers("x-owner-admin-id") ownerAdminId?: string, @Param("code") code?: string): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.deletePlan({ actor }, code ?? "");
  }

  @Get("content")
  async content(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    return { items: await this.adminService.listContent() };
  }

  @Post("content")
  createContent(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Body() body?: { key?: string; locale?: string; text?: string }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.updateContent({ actor }, body?.key ?? "", { locale: body?.locale, text: body?.text ?? "" });
  }

  @Patch("content")
  updateContent(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Body() body?: { key?: string; locale?: string; text?: string }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.updateContent({ actor }, body?.key ?? "", { locale: body?.locale, text: body?.text ?? "" });
  }

  @Get("channels")
  async channels(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    return { items: await this.adminService.listChannels() };
  }

  @Post("channels")
  createChannel(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Body() body?: { tgChannelId?: string; username?: string; inviteLink?: string; isActive?: boolean }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.createChannel({ actor }, { tgChannelId: body?.tgChannelId ?? "", ...body });
  }

  @Patch("channels/:id")
  updateChannel(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Param("id") id?: string,
    @Body() body?: { tgChannelId?: string; username?: string; inviteLink?: string; isActive?: boolean }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.updateChannel({ actor }, id ?? "", body ?? {});
  }

  @Delete("channels/:id")
  deleteChannel(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.deleteChannel({ actor }, id ?? "");
  }

  @Get("flags")
  async flags(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    return { items: await this.adminService.listFlags() };
  }

  @Patch("flags")
  updateFlag(
    @Headers("x-owner-admin-id") ownerAdminId?: string,
    @Body() body?: { key?: string; enabled?: boolean; description?: string }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.updateFlag(
      { actor },
      body?.key ?? "",
      { enabled: body?.enabled ?? false, description: body?.description }
    );
  }

  @Post("broadcast")
  broadcast(@Headers("x-owner-admin-id") ownerAdminId?: string, @Body() body?: unknown): object {
    this.assertOwner(ownerAdminId);
    return { ok: true, queued: true, body: body ?? {} };
  }
}
