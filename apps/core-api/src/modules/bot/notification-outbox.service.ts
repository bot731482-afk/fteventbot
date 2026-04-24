import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async tryEnqueue(data: {
    userId: string;
    telegramId: bigint;
    dedupeKey: string;
    body: string;
    kind: string;
  }): Promise<boolean> {
    try {
      await this.prisma.notificationOutbox.create({
        data: {
          userId: data.userId,
          telegramId: data.telegramId,
          dedupeKey: data.dedupeKey,
          body: data.body,
          kind: data.kind,
          status: "PENDING"
        }
      });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return false;
      }
      throw e;
    }
  }

  async claimBatch(limit: number): Promise<
    Array<{
      id: string;
      telegramId: string;
      body: string;
      kind: string;
    }>
  > {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.notificationOutbox.findMany({
        where: { status: "PENDING" },
        take: limit,
        orderBy: { createdAt: "asc" }
      });
      if (!rows.length) {
        return [];
      }
      await tx.notificationOutbox.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: "PROCESSING" }
      });
      return rows.map((r) => ({
        id: r.id,
        telegramId: String(r.telegramId),
        body: r.body,
        kind: r.kind
      }));
    });
  }

  async ack(
    id: string,
    ok: boolean,
    error?: string
  ): Promise<void> {
    if (ok) {
      await this.prisma.notificationOutbox.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), error: null }
      });
    } else {
      await this.prisma.notificationOutbox.update({
        where: { id },
        data: { status: "FAILED", error: error ? error.slice(0, 2000) : "send_failed" }
      });
    }
  }
}
