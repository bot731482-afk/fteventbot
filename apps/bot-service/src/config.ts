import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BotConfigV1 } from "@eon/shared-domain";
import { logRateLimited } from "./logger";
import { tryFetchRemoteConfig } from "./remoteConfig";
import { validateBotConfigV1 } from "@eon/shared-domain";
import { defaultBotConfigV1 } from "@eon/shared-domain";

function getServiceDir(): string {
  // src/* in dev, dist/* in production
  return path.resolve(__dirname, "..");
}

function resolveInServiceDir(filename: string): string {
  return path.resolve(getServiceDir(), filename);
}

const fallbackPath = process.env.BOT_CONFIG_PATH?.trim() || resolveInServiceDir("bot-config.json");
const cachePath = process.env.BOT_CONFIG_CACHE_PATH?.trim() || resolveInServiceDir("bot-config.cache.json");

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `${base}.tmp`);
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await rename(tmp, filePath);
}

export interface ConfigManagerOptions {
  coreApiBaseUrl?: string;
  remoteSyncIntervalMs?: number;
}

export class ConfigManager {
  private current: BotConfigV1;
  private readonly coreApiBaseUrl?: string;
  private readonly remoteSyncIntervalMs: number;

  constructor(fallback: BotConfigV1, options: ConfigManagerOptions) {
    this.current = fallback;
    this.coreApiBaseUrl = options.coreApiBaseUrl?.trim() ? options.coreApiBaseUrl.trim().replace(/\/v1\/?$/, "/v1") : undefined;
    this.remoteSyncIntervalMs = Math.max(10_000, options.remoteSyncIntervalMs ?? 60_000);
  }

  getConfig(): BotConfigV1 {
    return this.current;
  }

  static async create(options: ConfigManagerOptions): Promise<ConfigManager> {
    let fallback = defaultBotConfigV1;
    try {
      fallback = validateBotConfigV1(await readJsonFile<BotConfigV1>(fallbackPath));
    } catch {
      logRateLimited("warn", "config.fallback.missing", "Fallback bot-config missing/invalid → using built-in defaults", 60_000);
    }

    let seed = fallback;
    try {
      const cached = validateBotConfigV1(await readJsonFile<BotConfigV1>(cachePath));
      seed = cached;
    } catch {
      logRateLimited("info", "config.cache.missing", "No cached config found → using local fallback config", 60_000);
    }

    const manager = new ConfigManager(seed, options);
    await manager.syncOnce({ fallback });
    manager.startBackgroundSync({ fallback });
    return manager;
  }

  private startBackgroundSync({ fallback }: { fallback: BotConfigV1 }): void {
    if (!this.coreApiBaseUrl) return;
    setInterval(() => {
      void this.syncOnce({ fallback });
    }, this.remoteSyncIntervalMs).unref?.();
  }

  private async syncOnce({ fallback }: { fallback: BotConfigV1 }): Promise<void> {
    if (!this.coreApiBaseUrl) return;
    const remote = await tryFetchRemoteConfig(this.coreApiBaseUrl);
    if (!remote) return;

    this.current = remote;
    try {
      await writeJsonFileAtomic(cachePath, remote);
      logRateLimited("info", "config.sync.ok", "Remote config synced → cache updated", 60_000);
    } catch (error) {
      logRateLimited("warn", "config.cache.write_failed", `Failed to write config cache (${String(error)})`, 60_000);
    }
  }
}

export const configFiles = { fallbackPath, cachePath };

