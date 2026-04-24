import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1),
  FUNTIME_API_TOKEN: z.string().min(1),
  FUNTIME_API_BASE_URL: z.string().url().default("https://api.funtime.su"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_REQUIRED_CHANNELS: z.string().default(""),
  OWNER_ADMIN_ID: z.string().min(1),
  CRYPTOBOT_API_TOKEN: z.string().min(1),
  CRYPTOBOT_BASE_URL: z.string().url(),
  CORE_API_URL: z.string().url().optional(),
  CORE_API_HOST: z.string().default("0.0.0.0"),
  CORE_API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NEXT_PUBLIC_CORE_API_URL: z.string().url().optional(),
  BOT_CONFIG_PATH: z.string().optional(),
  BOT_CONFIG_CACHE_PATH: z.string().optional(),
  BOT_POLLING_OFFSET_PATH: z.string().optional(),
  BOT_CONFIG_STORE_PATH: z.string().optional(),
  BOT_CONFIG_HISTORY_DIR: z.string().optional(),
  PRISMA_ENABLED: z.string().optional()
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(raw);
}
