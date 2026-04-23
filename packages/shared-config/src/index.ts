import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  FUNTIME_API_TOKEN: z.string().min(1),
  FUNTIME_API_BASE_URL: z.string().url().default("https://api.funtime.su"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_REQUIRED_CHANNELS: z.string().default(""),
  OWNER_ADMIN_ID: z.string().min(1),
  CRYPTOBOT_API_TOKEN: z.string().min(1),
  CRYPTOBOT_BASE_URL: z.string().url()
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(raw);
}
