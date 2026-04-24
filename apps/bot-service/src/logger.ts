type LogLevel = "info" | "warn" | "error";

const lastLogAtByKey = new Map<string, number>();

export function logRateLimited(level: LogLevel, key: string, message: string, intervalMs: number): void {
  const now = Date.now();
  const last = lastLogAtByKey.get(key) ?? 0;
  if (now - last < intervalMs) return;
  lastLogAtByKey.set(key, now);

  if (level === "warn") console.warn(message);
  else if (level === "error") console.error(message);
  else console.log(message);
}

export function formatAxiosLikeError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const anyErr = error as any;
  const code = anyErr.code ? String(anyErr.code) : "";
  const message = anyErr.message ? String(anyErr.message) : "";
  const status = anyErr.response?.status ? String(anyErr.response.status) : "";
  const statusText = anyErr.response?.statusText ? String(anyErr.response.statusText) : "";

  const parts = [code, status && `${status} ${statusText}`.trim(), message].filter(Boolean);
  return parts.join(" | ") || "unknown error";
}
