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
  private currentSource: "remote" | "cache" | "local_fallback" | "built_in_default";
  private readonly coreApiBaseUrl?: string;
  private readonly remoteSyncIntervalMs: number;
  private syncFailureStreak = 0;
  private syncTimer?: NodeJS.Timeout;

  constructor(
    initial: BotConfigV1,
    source: "remote" | "cache" | "local_fallback" | "built_in_default",
    options: ConfigManagerOptions
  ) {
    this.current = initial;
    this.currentSource = source;
    this.coreApiBaseUrl = options.coreApiBaseUrl?.trim() ? options.coreApiBaseUrl.trim().replace(/\/v1\/?$/, "/v1") : undefined;
    this.remoteSyncIntervalMs = Math.max(10_000, options.remoteSyncIntervalMs ?? 60_000);
  }

  getConfig(): BotConfigV1 {
    return this.current;
  }

  static async create(options: ConfigManagerOptions): Promise<ConfigManager> {
    let fallback = defaultBotConfigV1;
    let fallbackSource: "local_fallback" | "built_in_default" = "built_in_default";
    try {
      fallback = validateBotConfigV1(await readJsonFile<BotConfigV1>(fallbackPath));
      fallbackSource = "local_fallback";
      logRateLimited("info", "config.fallback.ok", "Local fallback config loaded", 60_000);
    } catch {
      logRateLimited("warn", "config.fallback.invalid", "Fallback bot-config missing/invalid → using built-in defaults", 60_000);
    }

    let seed = fallback;
    let seedSource: "cache" | "local_fallback" | "built_in_default" = fallbackSource;
    try {
      const cached = validateBotConfigV1(await readJsonFile<BotConfigV1>(cachePath));
      seed = cached;
      seedSource = "cache";
      logRateLimited("info", "config.cache.ok", "Cached config loaded", 60_000);
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code ?? "");
      if (code === "ENOENT") {
        logRateLimited("info", "config.cache.missing", "No cached config found → using fallback config", 60_000);
      } else {
        logRateLimited("warn", "config.cache.invalid", `Cached config invalid/unreadable → using fallback config (${String(error)})`, 60_000);
      }
    }

    const manager = new ConfigManager(seed, seedSource, options);
    manager.startBackgroundSync();
    return manager;
  }

  private startBackgroundSync(): void {
    if (!this.coreApiBaseUrl) return;
    void this.syncOnce();
    this.scheduleNextSync(this.remoteSyncIntervalMs);
  }

  private scheduleNextSync(delayMs: number): void {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      void this.syncOnce();
    }, delayMs);
    this.syncTimer.unref?.();
  }

  private calculateRetryDelayMs(): number {
    const base = 5_000;
    const capped = Math.min(this.remoteSyncIntervalMs, base * 2 ** Math.max(0, this.syncFailureStreak - 1));
    const jitter = Math.floor(capped * 0.2 * Math.random());
    return capped + jitter;
  }

  private async syncOnce(): Promise<void> {
    if (!this.coreApiBaseUrl) return;
    const result = await tryFetchRemoteConfig(this.coreApiBaseUrl);
    if (!result.config) {
      this.syncFailureStreak += 1;
      logRateLimited(
        "warn",
        "remoteConfig.unavailable",
        `Remote config unavailable → keeping ${this.currentSource} config (${result.error})`,
        60_000
      );
      this.scheduleNextSync(this.calculateRetryDelayMs());
      return;
    }
    const remote = result.config;
    this.syncFailureStreak = 0;

    const changed = JSON.stringify(remote) !== JSON.stringify(this.current);
    this.current = remote;
    this.currentSource = "remote";
    if (!changed) {
      this.scheduleNextSync(this.remoteSyncIntervalMs);
      return;
    }

    try {
      await writeJsonFileAtomic(cachePath, remote);
      logRateLimited("info", "config.sync.ok", "Remote config synced → cache updated", 60_000);
    } catch (error) {
      logRateLimited("warn", "config.cache.write_failed", `Failed to write config cache (${String(error)})`, 60_000);
    }
    this.scheduleNextSync(this.remoteSyncIntervalMs);
  }
}

export const configFiles = { fallbackPath, cachePath };

