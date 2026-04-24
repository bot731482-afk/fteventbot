import type { ConfigManager } from "./config";

export interface SchedulerOptions {
  enabled?: boolean;
  configManager: ConfigManager;
  /** Product tick: e.g. pull notification outbox from core-api and send via Telegram. */
  onTick?: () => Promise<void>;
}

const defaultIntervalMs = 90_000;

export function startScheduler(options: SchedulerOptions): void {
  if (!(options.enabled ?? true)) {
    return;
  }
  void options.configManager;
  if (!options.onTick) {
    return;
  }
  const run = options.onTick;
  setInterval(() => {
    void run().catch((e) => console.error("scheduler tick failed", e));
  }, defaultIntervalMs);
  void run().catch((e) => console.error("scheduler first tick failed", e));
}
