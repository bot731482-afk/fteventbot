import axios from "axios";
import path from "node:path";
import { readFile, rename, writeFile } from "node:fs/promises";
import { Markup, Telegraf } from "telegraf";
import { ConfigManager } from "./config";
import { logRateLimited } from "./logger";
import { startScheduler } from "./scheduler";
import type { BotConfigV1 } from "@eon/shared-domain";
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const coreApiBaseUrl = (process.env.CORE_API_URL ?? "").trim();
const paymentsMode = (process.env.PAYMENTS_MODE ?? "free").trim().toLowerCase();
const botEnabled = (process.env.BOT_ENABLED ?? "true").trim().toLowerCase() !== "false";
const launchRetryMs = Math.max(1000, Number(process.env.BOT_LAUNCH_RETRY_MS ?? "30000") || 30000);
const pollingDebug = (process.env.BOT_POLLING_DEBUG ?? "false").trim().toLowerCase() === "true";
const schedulerEnabled = (process.env.SCHEDULER_ENABLED ?? "true").trim().toLowerCase() !== "false";
const coreApiRateLimitPerMinute = 100;
const coreApiMinIntervalMs = Math.ceil(60000 / coreApiRateLimitPerMinute);
let nextCoreApiRequestAt = 0;

console.log(`bot config: enabled=${botEnabled} paymentsMode=${paymentsMode}`);

let configManager: ConfigManager;
function getConfig(): BotConfigV1 {
  return configManager.getConfig();
}

const lastRequestAtByUser = new Map<number, number>();
function enforceCooldown(telegramId: number): { ok: true } | { ok: false; waitSec: number } {
  const cooldownSeconds = Math.max(0, Number(getConfig().limits.cooldownSeconds ?? 10) || 10);
  if (cooldownSeconds <= 0) return { ok: true };
  const now = Date.now();
  const last = lastRequestAtByUser.get(telegramId) ?? 0;
  const diffMs = now - last;
  if (diffMs < cooldownSeconds * 1000) {
    return { ok: false, waitSec: Math.ceil((cooldownSeconds * 1000 - diffMs) / 1000) };
  }
  lastRequestAtByUser.set(telegramId, now);
  return { ok: true };
}

async function throttleCoreApi(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextCoreApiRequestAt - now);
  nextCoreApiRequestAt = Math.max(now, nextCoreApiRequestAt) + coreApiMinIntervalMs;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

async function coreApiGet<T>(path: string): Promise<T> {
  if (!coreApiBaseUrl) {
    throw new Error("CORE_API_URL is not set");
  }
  await throttleCoreApi();
  const response = await axios.get<T>(`${coreApiBaseUrl.replace(/\/$/, "")}${path}`, { timeout: 5000 });
  return response.data;
}

async function hasRequiredSubscription(telegramId: number, config: BotConfigV1): Promise<boolean> {
  const required = config.channels.filter((item: BotConfigV1["channels"][number]) => item.isActive && item.isRequired);
  if (required.length === 0) return true;
  for (const channel of required) {
    try {
      const tgChannelId = channel.tgChannelId ?? channel.username ?? "";
      if (!tgChannelId) return true;
      const member = await bot.telegram.getChatMember(tgChannelId, telegramId);
      if (!["creator", "administrator", "member"].includes(member.status)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

bot.start(async (ctx) => {
  try {
    const config = getConfig();
    const telegramId = ctx.from.id;
    const subscribed = config.flags.subscriptionsCheckEnabled ? await hasRequiredSubscription(telegramId, config) : true;
    if (!subscribed && config.flags.subscriptionsCheckEnabled) {
      const firstLink = config.channels.find((item) => item.isActive && item.isRequired)?.inviteLink ?? "https://t.me";
      await ctx.reply(
        config.content.subscriptionRequiredMessage,
        Markup.inlineKeyboard([
          [Markup.button.url("Подписаться", firstLink)],
          [Markup.button.callback("Проверить подписку", "check_sub")]
        ])
      );
      return;
    }

    const buttons = config.menuButtons.main.length ? config.menuButtons.main : ["Профиль", "События", "Поддержка"];
    await ctx.reply(
      config.content.startMessage,
      Markup.keyboard(buttons.map((item: string) => [item])).resize()
    );
  } catch (error) {
    console.error("start handler error", error);
    await ctx.reply("Временная ошибка. Попробуйте позже.");
  }
});

bot.action("check_sub", async (ctx) => {
  const config = getConfig();
  const subscribed = config.flags.subscriptionsCheckEnabled ? await hasRequiredSubscription(ctx.from.id, config) : true;
  await ctx.answerCbQuery(subscribed ? "Подписка подтверждена" : "Подписка не подтверждена");
});

bot.hears(/События|Открыть события|Ближайшие ивенты/i, async (ctx) => {
  const cooldown = enforceCooldown(ctx.from.id);
  if (!cooldown.ok) {
    const cooldownSeconds = Math.max(0, Number(getConfig().limits.cooldownSeconds ?? 10) || 10);
    await ctx.reply(`Подожди ${cooldown.waitSec} сек. (кд ${cooldownSeconds} сек)`);
    return;
  }
  const config = getConfig();
  if (!config.flags.eventsEnabled) {
    await ctx.reply(config.content.eventsUnavailableMessage);
    return;
  }
  try {
    const response = await coreApiGet<{ items: Array<{ displayLabel: string }> }>("/bot/events/nearest");
    const lines = response.items.map((item: { displayLabel: string }) => item.displayLabel);
    await ctx.reply(lines.join("\n") || "Нет данных по ивентам");
  } catch (error) {
    logRateLimited("warn", "events.api.unavailable", "API unavailable → using local fallback response for events", 60_000);
    await ctx.reply(config.content.eventsUnavailableMessage);
  }
});

bot.hears(/Поддержка/i, async (ctx) => {
  await ctx.reply(getConfig().content.supportMessage);
});

bot.hears(/Купить доступ/i, async (ctx) => {
  if (paymentsMode === "free") {
    await ctx.reply("Сейчас все запросы бесплатные. Позже можно будет включить оплату через CryptoBot.");
    return;
  }
  await ctx.reply("Оплата через CryptoBot включена, но покупка в боте пока не настроена.");
});

bot.catch(async (error, ctx) => {
  console.error("bot error", error);
  await ctx.reply("Произошла ошибка. Попробуйте позже.");
});

function isConflict409(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeResponse = (error as { response?: { error_code?: number } }).response;
  return maybeResponse?.error_code === 409;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let offset = 0;
const processedUpdateIds = new Set<number>();
const processedUpdateOrder: number[] = [];
const maxRememberedUpdates = 5000;
const offsetStatePath = process.env.BOT_POLLING_OFFSET_PATH?.trim() || path.resolve(__dirname, "..", "bot-polling.offset.json");

function rememberProcessedUpdate(updateId: number): void {
  if (processedUpdateIds.has(updateId)) return;
  processedUpdateIds.add(updateId);
  processedUpdateOrder.push(updateId);
  if (processedUpdateOrder.length > maxRememberedUpdates) {
    const oldest = processedUpdateOrder.shift();
    if (oldest !== undefined) {
      processedUpdateIds.delete(oldest);
    }
  }
}

function getUpdatePreview(update: any): string {
  const text = update?.message?.text ?? update?.callback_query?.data ?? update?.callback_query?.message?.text;
  if (!text) return "-";
  return String(text).replace(/\s+/g, " ").trim().slice(0, 80);
}

function getUpdateKind(update: any): string {
  if (update?.callback_query) return "callback_query";
  if (update?.message?.text?.startsWith?.("/")) return "command";
  if (update?.message) return "message";
  if (update?.edited_message) return "edited_message";
  return "other";
}

function getUpdateMeta(update: any): {
  updateId: number;
  kind: string;
  preview: string;
  chatId: number | null;
  userId: number | null;
} {
  return {
    updateId: Number(update?.update_id ?? -1),
    kind: getUpdateKind(update),
    preview: getUpdatePreview(update),
    chatId: update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id ?? null,
    userId: update?.from?.id ?? update?.message?.from?.id ?? update?.callback_query?.from?.id ?? null
  };
}

function logPollingDebug(message: string, payload?: unknown): void {
  if (!pollingDebug) return;
  if (payload === undefined) {
    console.log(`[polling] ${message}`);
    return;
  }
  console.log(`[polling] ${message}`, payload);
}

async function loadOffsetState(): Promise<void> {
  try {
    const raw = await readFile(offsetStatePath, "utf8");
    const parsed = JSON.parse(raw) as { offset?: number };
    const next = Number(parsed.offset ?? 0);
    if (Number.isInteger(next) && next >= 0) {
      offset = next;
      logPollingDebug("offset loaded", { offset });
      return;
    }
    logRateLimited("warn", "polling.offset.invalid", `[polling] invalid offset in state file, resetting to zero (${offsetStatePath})`, 60_000);
    offset = 0;
  } catch (error) {
    const code = String((error as any)?.code ?? "");
    if (code === "ENOENT") {
      logRateLimited("info", "polling.offset.missing", "[polling] no persisted offset found, starting from current Telegram queue", 60_000);
    } else {
      logRateLimited("warn", "polling.offset.load_failed", `[polling] failed to load offset state, resetting to zero (${String(error)})`, 60_000);
    }
    offset = 0;
  }
}

async function persistOffsetState(): Promise<void> {
  const tmpPath = `${offsetStatePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify({ offset }, null, 2), "utf8");
  await rename(tmpPath, offsetStatePath);
}

async function safePersistOffsetState(context: string): Promise<void> {
  try {
    await persistOffsetState();
  } catch (error) {
    logRateLimited(
      "warn",
      "polling.offset.persist_failed",
      `[polling] failed to persist offset (${context}): ${String(error)}`,
      30_000
    );
  }
}

async function processUpdate(update: any): Promise<void> {
  const meta = getUpdateMeta(update);
  const updateId = meta.updateId;
  const nextOffset = updateId + 1;

  if (!Number.isInteger(updateId) || updateId < 0) {
    console.error("[polling] skip invalid update_id", meta);
    return;
  }

  if (processedUpdateIds.has(updateId)) {
    if (offset < nextOffset) {
      offset = nextOffset;
      await safePersistOffsetState("duplicate_update");
    }
    logPollingDebug("duplicate update skipped", { ...meta, offset });
    return;
  }

  let ok = false;
  logPollingDebug("update received", meta);
  try {
    await (bot as any).handleUpdate(update);
    ok = true;
  } catch (error) {
    // Do not rethrow: poison update must not block the queue forever.
    console.error("[polling] update handling failed", { ...meta, error });
  } finally {
    // Ack update deterministically after processing attempt.
    if (offset < nextOffset) {
      offset = nextOffset;
      await safePersistOffsetState("ack_update");
    }
    rememberProcessedUpdate(updateId);
    logPollingDebug("update ack", { updateId, ok, offset });
  }
}

function withJitter(ms: number): number {
  const jitter = Math.floor(ms * 0.2 * Math.random());
  return ms + jitter;
}

function getTelegramRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as any).response;
  const retryAfter = Number(response?.parameters?.retry_after);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return null;
}

async function startManualPolling(): Promise<void> {
  console.log("manual polling started");
  await loadOffsetState();
  let pollingErrorBackoffMs = 1000;
  while (true) {
    try {
      const updates = await (bot.telegram as any).getUpdates({
        offset,
        timeout: 30,
        limit: 100,
        allowed_updates: ["message", "callback_query"]
      });
      pollingErrorBackoffMs = 1000;
      if (!updates.length) {
        continue;
      }
      logPollingDebug("updates fetched", { count: updates.length, offset });
      for (const update of updates) {
        await processUpdate(update);
      }
    } catch (error) {
      const retryAfterMs = getTelegramRetryAfterMs(error);
      const sleepMs = retryAfterMs ?? withJitter(Math.min(pollingErrorBackoffMs, 30_000));
      if (isConflict409(error)) {
        logRateLimited("warn", "polling.conflict", "[polling] Telegram 409 conflict detected, retrying with backoff", 60_000);
      } else if (retryAfterMs) {
        logRateLimited("warn", "polling.retry_after", `[polling] Telegram requested retry_after=${Math.ceil(retryAfterMs / 1000)}s`, 60_000);
      } else {
        logRateLimited("warn", "polling.error", `[polling] polling error, retrying (${String((error as any)?.message ?? error)})`, 60_000);
      }
      await sleep(sleepMs);
      pollingErrorBackoffMs = Math.min(pollingErrorBackoffMs * 2, 30_000);
    }
  }
}

async function launchWithRetry(): Promise<void> {
  if (!botEnabled) {
    console.log("bot disabled via BOT_ENABLED=false");
    return;
  }
  let launchAttempt = 0;
  for (;;) {
    try {
      configManager = await ConfigManager.create({ coreApiBaseUrl, remoteSyncIntervalMs: 60_000 });
      console.log("startup: config manager ready");
      startScheduler({ configManager, enabled: schedulerEnabled });
      console.log(`startup: scheduler ${schedulerEnabled ? "enabled" : "disabled"}`);
      const me = await bot.telegram.getMe();
      console.log("startup: telegram identity verified", me.username);
      try {
        await bot.telegram.deleteWebhook();
      } catch (error) {
        logRateLimited("warn", "telegram.delete_webhook_failed", `startup: deleteWebhook failed (${String(error)})`, 60_000);
      }
      console.log("startup: polling loop starting");
      await startManualPolling();
      return;
    } catch (error) {
      launchAttempt += 1;
      if (isConflict409(error)) {
        console.warn("telegram returned 409 conflict; another bot instance is active, will retry");
      }
      const cappedBackoffMs = Math.min(120_000, launchRetryMs * 2 ** Math.max(0, launchAttempt - 1));
      const sleepMs = withJitter(cappedBackoffMs);
      logRateLimited(
        "error",
        "bot.launch.failed",
        `startup: launch failed, retrying in ${Math.ceil(sleepMs / 1000)}s (${String((error as any)?.message ?? error)})`,
        10_000
      );
      await sleep(sleepMs);
    }
  }
}

void launchWithRetry();
