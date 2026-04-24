import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();

    this.$use(async (params, next) => {
      const maxAttempts = 3;
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await next(params);
        } catch (error: any) {
          lastError = error;
          const msg = String(error?.message ?? "");
          const code = String(error?.code ?? "");
          const retryable =
            code === "P1017" ||
            code === "P1001" ||
            msg.includes("Server has closed the connection") ||
            msg.includes("Timed out fetching a new connection from the connection pool");

          if (!retryable || attempt === maxAttempts) {
            throw error;
          }

          try {
            await this.$disconnect();
          } catch {
            // ignore
          }
          await this.safeConnect();
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }
      throw lastError;
    });
  }

  async onModuleInit(): Promise<void> {
    if ((process.env.PRISMA_ENABLED ?? "true").trim().toLowerCase() === "false") {
      return;
    }
    await this.safeConnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.once("beforeExit", async () => {
      await app.close();
    });
  }

  private async safeConnect(): Promise<void> {
    const tries = 5;
    let lastError: unknown;
    for (let i = 0; i < tries; i += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((r) => setTimeout(r, 500 + i * 500));
      }
    }
    throw lastError;
  }
}
