import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BotConfigV1 } from "./types";
import { logRateLimited } from "./logger";
import { mapRemoteToBotConfigV1, tryFetchRemoteConfig } from "./remoteConfig";

function resolveInServiceDir(filename: string): string {
  // When run via pnpm --filter, cwd is typically apps/bot-service
  return path.resolve(process.cwd(), filename);
}

const fallbackPath = resolveInServiceDir("bot-config.json");
const cachePath = resolveInServiceDir("bot-config.cache.json");

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
    const fallback = await readJsonFile<BotConfigV1>(fallbackPath);

    let seed = fallback;
    try {
      const cached = await readJsonFile<BotConfigV1>(cachePath);
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

    const mapped = mapRemoteToBotConfigV1(remote, fallback);
    this.current = mapped;
    try {
      await writeJsonFileAtomic(cachePath, mapped);
      logRateLimited("info", "config.sync.ok", "Remote config synced → cache updated", 60_000);
    } catch (error) {
      logRateLimited("warn", "config.cache.write_failed", `Failed to write config cache (${String(error)})`, 60_000);
    }
  }
}

export const configFiles = { fallbackPath, cachePath };

