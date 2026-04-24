import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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

  @Post("funtime/refresh")
  async funtimeRefresh(@Headers("x-owner-admin-id") ownerAdminId?: string): Promise<object> {
    this.assertOwner(ownerAdminId);
    const snapshot = await this.funtimeService.refreshEventsSnapshot();
    return { ok: true, fetchedAt: snapshot.fetchedAt, stale: snapshot.stale, servers: snapshot.items.length };
  }

  @Get("users")
  users(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Query("q") q?: string,
    @Query("take") take?: string
  ): Promise<object> {
    this.assertOwner(ownerAdminId);
    const n = take != null && take !== "" ? Number(take) : 30;
    return this.adminService.listUsers(q, Number.isInteger(n) ? n : 30);
  }

  @Get("users/:id")
  getUser(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.getUserById({ actor }, id ?? "");
  }

  @Patch("users/:id/unlimited")
  grantUnlimited(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.grantUnlimited({ actor }, id ?? "");
  }

  @Delete("users/:id/unlimited")
  revokeUnlimited(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.revokeUnlimited({ actor }, id ?? "");
  }

  @Patch("users/:id/ban")
  setUserBan(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string,
    @Body() body?: { banned?: boolean }
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.setUserBanned({ actor }, id ?? "", body?.banned ?? true);
  }

  @Post("users/:id/reset-cooldown")
  resetUserCooldown(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.resetEventCooldown({ actor }, id ?? "");
  }

  @Post("users/:id/reset-daily")
  resetUserDaily(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.resetDailyUsage({ actor }, id ?? "");
  }

  @Post("users/:id/test-notification")
  testUserNotification(
    @Headers("x-owner-admin-id") ownerAdminId: string | undefined,
    @Param("id") id?: string
  ): Promise<object> {
    const actor = this.assertOwner(ownerAdminId);
    return this.adminService.enqueueTestNotification({ actor }, id ?? "");
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
