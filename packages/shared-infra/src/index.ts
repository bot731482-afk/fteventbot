export const QUEUES = {
  FUNTIME_SYNC: "funtime-sync",
  NOTIFICATIONS: "notifications",
  BILLING: "billing",
  BROADCAST: "broadcast"
} as const;

export const CACHE_KEYS = {
  SERVERS_LIST: "funtime:servers:list",
  EVENTS_ALL: "funtime:events:all",
  eventsByServer: (serverCode: string) => `funtime:events:server:${serverCode}`,
  userProfile: (telegramId: number) => `user:profile:${telegramId}`
} as const;

export const LOCK_KEYS = {
  FUNTIME_REFRESH: "lock:funtime:refresh"
} as const;

export class RetryableUpstreamError extends Error {}
export class RateLimitUpstreamError extends Error {}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 250
): Promise<T> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * 100);
      const backoff = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error("Unreachable");
}
