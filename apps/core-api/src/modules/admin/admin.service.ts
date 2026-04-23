import { BadRequestException, Injectable } from "@nestjs/common";
import { FeatureFlag, Plan, PlanKind, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type OwnerActor = { actor: string };

type PlanCreateInput = {
  code: string;
  title: string;
  kind: PlanKind;
  price: number;
  viewsAmount?: number | null;
  enabled?: boolean;
};

type PlanUpdateInput = Partial<Omit<PlanCreateInput, "code">>;
type ChannelCreateInput = { tgChannelId: string; username?: string | null; inviteLink?: string | null; isActive?: boolean };
type ChannelUpdateInput = Partial<ChannelCreateInput>;
type ContentUpdateInput = { locale?: string; text: string };
type FlagUpdateInput = { description?: string | null; enabled: boolean };

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(): Promise<object> {
    const [total, unlimited, activeNotifications, invoicesPaid, revenue] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isUnlimitedLifetime: true } }),
      this.prisma.userNotification.count({ where: { isActive: true } }),
      this.prisma.billingInvoice.count({ where: { status: "PAID" } }),
      this.prisma.billingInvoice.aggregate({ where: { status: "PAID" }, _sum: { amount: true } })
    ]);

    return {
      users: { total, unlimited, activeNotifications },
      sales: { invoicesPaid, revenue: Number(revenue._sum.amount ?? 0) },
      apiUsage: { funtimeRequests: 0, errors: 0 }
    };
  }

  listPlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({ orderBy: [{ enabled: "desc" }, { createdAt: "asc" }] });
  }

  async createPlan(owner: OwnerActor, input: PlanCreateInput): Promise<Plan> {
    const payload = this.validatePlanCreateInput(input);
    const plan = await this.prisma.plan.create({ data: payload });
    await this.log(owner, "plan.create", "Plan", plan.id, payload);
    return plan;
  }

  async updatePlan(owner: OwnerActor, code: string, input: PlanUpdateInput): Promise<Plan> {
    if (!code) throw new BadRequestException("code is required");
    const payload = this.validatePlanUpdateInput(input);
    const plan = await this.prisma.plan.update({ where: { code: code.trim().toUpperCase() }, data: payload });
    await this.log(owner, "plan.update", "Plan", plan.id, payload);
    return plan;
  }

  async deletePlan(owner: OwnerActor, code: string): Promise<{ ok: true }> {
    if (!code) throw new BadRequestException("code is required");
    const deleted = await this.prisma.plan.delete({ where: { code: code.trim().toUpperCase() } });
    await this.log(owner, "plan.delete", "Plan", deleted.id, { code });
    return { ok: true };
  }

  listContent(): Promise<Array<{ key: string; locale: string; text: string; updatedAt: Date }>> {
    return this.prisma.contentBlock.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] });
  }

  async updateContent(owner: OwnerActor, key: string, input: ContentUpdateInput): Promise<object> {
    if (!key || key.trim().length < 2) {
      throw new BadRequestException("key is required");
    }
    if (!input.text || input.text.trim().length === 0) {
      throw new BadRequestException("text is required");
    }
    const locale = (input.locale ?? "ru").trim();
    const block = await this.prisma.contentBlock.upsert({
      where: { key_locale: { key, locale } },
      update: { text: input.text },
      create: { key, locale, text: input.text }
    });
    await this.log(owner, "content.upsert", "ContentBlock", block.id, { key, locale });
    return block;
  }

  listChannels(): Promise<Array<{ id: string; tgChannelId: string; username: string | null; inviteLink: string | null; isActive: boolean }>> {
    return this.prisma.requiredChannel.findMany({ orderBy: { createdAt: "asc" } });
  }

  async createChannel(owner: OwnerActor, input: ChannelCreateInput): Promise<object> {
    if (!input.tgChannelId || input.tgChannelId.trim().length === 0) {
      throw new BadRequestException("tgChannelId is required");
    }
    const channel = await this.prisma.requiredChannel.create({
      data: {
        tgChannelId: input.tgChannelId.trim(),
        username: input.username?.trim() || null,
        inviteLink: input.inviteLink?.trim() || null,
        isActive: input.isActive ?? true
      }
    });
    await this.log(owner, "channel.create", "RequiredChannel", channel.id, { tgChannelId: channel.tgChannelId });
    return channel;
  }

  async updateChannel(owner: OwnerActor, id: string, input: ChannelUpdateInput): Promise<object> {
    if (!id) throw new BadRequestException("id is required");
    const data: Prisma.RequiredChannelUpdateInput = {};
    if (input.tgChannelId !== undefined) data.tgChannelId = input.tgChannelId.trim();
    if (input.username !== undefined) data.username = input.username?.trim() || null;
    if (input.inviteLink !== undefined) data.inviteLink = input.inviteLink?.trim() || null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const channel = await this.prisma.requiredChannel.update({ where: { id }, data });
    await this.log(owner, "channel.update", "RequiredChannel", channel.id, data);
    return channel;
  }

  async deleteChannel(owner: OwnerActor, id: string): Promise<{ ok: true }> {
    if (!id) throw new BadRequestException("id is required");
    await this.prisma.requiredChannel.delete({ where: { id } });
    await this.log(owner, "channel.delete", "RequiredChannel", id, {});
    return { ok: true };
  }

  listFlags(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  }

  async updateFlag(owner: OwnerActor, key: string, input: FlagUpdateInput): Promise<FeatureFlag> {
    if (!key || key.trim().length < 2) {
      throw new BadRequestException("key is required");
    }
    const flag = await this.prisma.featureFlag.upsert({
      where: { key: key.trim() },
      update: {
        enabled: input.enabled,
        description: input.description ?? null
      },
      create: {
        key: key.trim(),
        enabled: input.enabled,
        description: input.description ?? null
      }
    });
    await this.log(owner, "flag.upsert", "FeatureFlag", flag.id, { key, enabled: flag.enabled });
    return flag;
  }

  private validatePlanCreateInput(input: PlanCreateInput): Prisma.PlanCreateInput {
    const code = input.code.trim().toUpperCase();
    if (code.length < 3) throw new BadRequestException("code must be >= 3 chars");
    const data: Prisma.PlanCreateInput = { code, title: "", kind: "VIEWS", price: 0 };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException("title is required");
      data.title = title;
    }
    data.kind = input.kind;
    if (!Number.isFinite(input.price) || input.price < 0) throw new BadRequestException("price must be >= 0");
    data.price = input.price;
    if (input.viewsAmount !== undefined) {
      if (input.viewsAmount !== null && (!Number.isInteger(input.viewsAmount) || input.viewsAmount < 0)) {
        throw new BadRequestException("viewsAmount must be null or integer >= 0");
      }
      data.viewsAmount = input.viewsAmount;
    }
    if (input.enabled !== undefined) data.enabled = input.enabled;
    return data;
  }

  private validatePlanUpdateInput(input: PlanUpdateInput): Prisma.PlanUpdateInput {
    const data: Prisma.PlanUpdateInput = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException("title is required");
      data.title = title;
    }
    if (input.kind !== undefined) {
      data.kind = input.kind;
    }
    if (input.price !== undefined) {
      if (!Number.isFinite(input.price) || input.price < 0) throw new BadRequestException("price must be >= 0");
      data.price = input.price;
    }
    if (input.viewsAmount !== undefined) {
      if (input.viewsAmount !== null && (!Number.isInteger(input.viewsAmount) || input.viewsAmount < 0)) {
        throw new BadRequestException("viewsAmount must be null or integer >= 0");
      }
      data.viewsAmount = input.viewsAmount;
    }
    if (input.enabled !== undefined) data.enabled = input.enabled;
    return data;
  }

  private async log(owner: OwnerActor, action: string, entity: string, entityId: string, metadata: object): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor: owner.actor,
        action,
        entity,
        metadata: { entityId, ...metadata }
      }
    });
  }
}
