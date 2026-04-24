import type { ConfigManager } from "./config";

export interface SchedulerOptions {
  enabled?: boolean;
  configManager: ConfigManager;
}

export function startScheduler(options: SchedulerOptions): void {
  const enabled = options.enabled ?? true;
  if (!enabled) {
    return;
  }

  // For v1: scheduler is intentionally minimal.
  // Remote config sync already runs inside ConfigManager on an interval.
  // This hook exists to host future periodic tasks (notifications, reminders, retries)
  // without requiring a separate worker process.
  void options.configManager;
}

