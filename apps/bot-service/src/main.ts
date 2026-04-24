import axios from "axios";
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
async function startManualPolling(): Promise<void> {
  console.log("manual polling started");
  while (true) {
    try {
      console.log("waiting updates, offset:", offset);
      const updates = await (bot.telegram as any).getUpdates({
        offset,
        timeout: 30,
        limit: 100,
        allowed_updates: ["message", "callback_query"]
      });
      console.log("updates fetched:", updates.length);
      if (!updates.length) {
        continue;
      }
      for (const update of updates) {
        offset = update.update_id + 1;
        console.log("processing update:", update.update_id, update.update_type);
        await (bot as any).handleUpdate(update);
      }
    } catch (error) {
      if (isConflict409(error)) {
        console.warn("409 conflict detected");
        await sleep(5000);
        continue;
      }
      console.error("polling error", error);
      await sleep(3000);
    }
  }
}

async function launchWithRetry(): Promise<void> {
  if (!botEnabled) {
    console.log("bot disabled via BOT_ENABLED=false");
    return;
  }
  for (;;) {
    try {
      configManager = await ConfigManager.create({ coreApiBaseUrl, remoteSyncIntervalMs: 60_000 });
      startScheduler({ configManager });
      console.log("before getMe");
      const me = await bot.telegram.getMe();
      console.log("getMe success:", me.username);
      try {
        await bot.telegram.deleteWebhook();
      } catch (error) {
        console.warn("deleteWebhook failed", error);
      }
      await sleep(1500);
      console.log("before manual polling");
      await startManualPolling();
      return;
    } catch (error) {
      if (isConflict409(error)) {
        console.warn("telegram returned 409 conflict; another bot instance is active, will retry");
      }
      console.error(`bot launch failed; retrying in ${Math.ceil(launchRetryMs / 1000)}s`, error);
      await sleep(launchRetryMs);
    }
  }
}

void launchWithRetry();
