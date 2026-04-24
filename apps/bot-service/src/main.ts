import axios from "axios";
import { Markup, Telegraf } from "telegraf";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

function toProxyUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("socks5://") ||
    value.startsWith("socks4://")
  ) {
    return value;
  }
  // host:port:user:pass
  const parts = value.split(":");
  if (parts.length < 2) return value;
  const host = parts[0];
  const port = parts[1];
  const user = parts[2];
  const pass = parts.slice(3).join(":");
  const proxyType = (process.env.TELEGRAM_PROXY_TYPE ?? "http").trim().toLowerCase();
  const protocol = proxyType.startsWith("socks") ? "socks5" : "http";
  if (user && pass) {
    return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  return `${protocol}://${host}:${port}`;
}

const proxyUrl = toProxyUrl(process.env.TELEGRAM_PROXY_URL ?? "");
const telegramAgent = (() => {
  if (!proxyUrl) return undefined;
  if (proxyUrl.startsWith("socks5://") || proxyUrl.startsWith("socks4://")) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
})();

const bot = new Telegraf(
  process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAgent ? { telegram: { agent: telegramAgent as any } } : undefined
);

const proxyInfo = (() => {
  if (!proxyUrl) return "none";
  try {
    const url = new URL(proxyUrl);
    return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return "custom";
  }
})();
const apiBaseUrl = process.env.CORE_API_URL ?? "http://localhost:3000/v1";
const cooldownSeconds = Math.max(0, Number(process.env.BOT_COOLDOWN_SECONDS ?? "10") || 10);
const paymentsMode = (process.env.PAYMENTS_MODE ?? "free").trim().toLowerCase();
const botEnabled = (process.env.BOT_ENABLED ?? "true").trim().toLowerCase() !== "false";
const launchRetryMs = Math.max(1000, Number(process.env.BOT_LAUNCH_RETRY_MS ?? "30000") || 30000);
const coreApiRateLimitPerMinute = 100;
const coreApiMinIntervalMs = Math.ceil(60000 / coreApiRateLimitPerMinute);
let nextCoreApiRequestAt = 0;

console.log(`bot config: enabled=${botEnabled} cooldown=${cooldownSeconds}s paymentsMode=${paymentsMode} telegramProxy=${proxyInfo}`);

const lastRequestAtByUser = new Map<number, number>();
function enforceCooldown(telegramId: number): { ok: true } | { ok: false; waitSec: number } {
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

interface BotConfig {
  content: Record<string, string>;
  menuButtons: string[];
  channels: Array<{ tgChannelId: string; username: string | null; inviteLink: string | null; isActive: boolean }>;
  flags: Record<string, boolean>;
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
  await throttleCoreApi();
  const response = await axios.get<T>(`${apiBaseUrl}${path}`);
  return response.data;
}

async function fetchBotConfig(): Promise<BotConfig> {
  return coreApiGet<BotConfig>("/bot/config");
}

async function hasRequiredSubscription(telegramId: number, config: BotConfig): Promise<boolean> {
  const required = config.channels.filter((item) => item.isActive);
  if (required.length === 0) return true;
  for (const channel of required) {
    try {
      const member = await bot.telegram.getChatMember(channel.tgChannelId, telegramId);
      if (!["creator", "administrator", "member"].includes(member.status)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function getText(content: Record<string, string>, key: string, fallback: string): string {
  return content[key]?.trim() || fallback;
}

bot.start(async (ctx) => {
  const config = await fetchBotConfig();
  const telegramId = ctx.from.id;
  const subscribed = await hasRequiredSubscription(telegramId, config);
  if (!subscribed && (config.flags["enforce.required.channels"] ?? true)) {
    const firstLink = config.channels.find((item) => item.inviteLink)?.inviteLink ?? "https://t.me";
    await ctx.reply(
      getText(config.content, "subscription.required.prompt", "Подпишитесь на обязательные каналы для использования бота"),
      Markup.inlineKeyboard([
        [Markup.button.url(getText(config.content, "subscription.required.button", "Подписаться"), firstLink)],
        [Markup.button.callback(getText(config.content, "subscription.check.button", "Проверить подписку"), "check_sub")]
      ])
    );
    return;
  }

  const buttons = config.menuButtons.length ? config.menuButtons : ["Ближайшие ивенты", "Уведомить меня", "Профиль", "Купить доступ"];
  await ctx.reply(
    getText(config.content, "menu.title", "Главное меню"),
    Markup.keyboard(buttons.map((item) => [item])).resize()
  );
});

bot.action("check_sub", async (ctx) => {
  const config = await fetchBotConfig();
  const subscribed = await hasRequiredSubscription(ctx.from.id, config);
  await ctx.answerCbQuery(subscribed ? "Подписка подтверждена" : "Подписка не подтверждена");
});

bot.hears(/Ближайшие ивенты/i, async (ctx) => {
  const cooldown = enforceCooldown(ctx.from.id);
  if (!cooldown.ok) {
    await ctx.reply(`Подожди ${cooldown.waitSec} сек. (кд ${cooldownSeconds} сек)`);
    return;
  }
  const response = await coreApiGet<{ items: Array<{ displayLabel: string }> }>("/bot/events/nearest");
  const lines = response.items.map((item) => item.displayLabel);
  await ctx.reply(lines.join("\n") || "Нет данных по ивентам");
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

async function launchWithRetry(): Promise<void> {
  if (!botEnabled) {
    console.log("bot disabled via BOT_ENABLED=false");
    return;
  }
  for (;;) {
    try {
      console.log("before getMe");
      const me = await bot.telegram.getMe();
      console.log("getMe success:", me.username);
      console.log("before launch");
      await bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ["message", "callback_query"],
      });
      console.log("bot launched");
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
