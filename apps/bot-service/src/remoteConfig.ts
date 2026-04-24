import axios from "axios";
import { formatAxiosLikeError, logRateLimited } from "./logger";
import type { BotConfigV1 } from "./types";

export interface RemoteBotConfigRaw {
  content?: Record<string, string>;
  menuButtons?: string[];
  channels?: Array<{
    title?: string | null;
    tgChannelId?: string;
    username?: string | null;
    inviteLink?: string | null;
    isActive?: boolean;
    isRequired?: boolean;
  }>;
  flags?: Record<string, boolean>;
}

function splitLines(value: string | undefined | null): string[] {
  return (value ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function mapRemoteToBotConfigV1(remote: RemoteBotConfigRaw, fallback: BotConfigV1): BotConfigV1 {
  const content = remote.content ?? {};

  const startMessage = content["startMessage"] ?? content["menu.title"] ?? fallback.content.startMessage;
  const subscriptionRequiredMessage =
    content["subscriptionRequiredMessage"] ?? content["subscription.required.prompt"] ?? fallback.content.subscriptionRequiredMessage;
  const eventsUnavailableMessage = content["eventsUnavailableMessage"] ?? fallback.content.eventsUnavailableMessage;
  const supportMessage = content["supportMessage"] ?? fallback.content.supportMessage;

  const menuMainFromContent = splitLines(content["menuButtons.main"]);
  const menuMain =
    menuMainFromContent.length > 0
      ? menuMainFromContent
      : Array.isArray(remote.menuButtons) && remote.menuButtons.length
        ? remote.menuButtons
        : fallback.menuButtons.main;

  const menuAfterSubscription = splitLines(content["menuButtons.afterSubscription"]);

  const channels = Array.isArray(remote.channels) ? remote.channels : [];
  const mappedChannels = channels
    .filter((c) => Boolean(c.isActive))
    .map((c) => ({
      title: (c.title ?? c.username ?? c.tgChannelId ?? "Channel").toString(),
      username: c.username ?? null,
      inviteLink: c.inviteLink ?? null,
      isRequired: Boolean(c.isRequired ?? true),
      isActive: Boolean(c.isActive ?? true),
      tgChannelId: c.tgChannelId ?? null
    }));

  const rf = remote.flags ?? {};
  const subscriptionsCheckEnabled = rf["subscriptionsCheckEnabled"] ?? rf["enforce.required.channels"] ?? fallback.flags.subscriptionsCheckEnabled;
  const eventsEnabled = rf["eventsEnabled"] ?? fallback.flags.eventsEnabled;
  const notificationsEnabled = rf["notificationsEnabled"] ?? fallback.flags.notificationsEnabled;
  const paymentsEnabled = rf["paymentsEnabled"] ?? fallback.flags.paymentsEnabled;

  const cooldownSecondsRaw = content["limits.cooldownSeconds"];
  const cooldownSecondsFromRemote = cooldownSecondsRaw ? Number(cooldownSecondsRaw) : undefined;

  return {
    content: { startMessage, subscriptionRequiredMessage, eventsUnavailableMessage, supportMessage },
    menuButtons: {
      main: menuMain,
      afterSubscription: menuAfterSubscription.length ? menuAfterSubscription : fallback.menuButtons.afterSubscription
    },
    channels: mappedChannels.length ? mappedChannels : fallback.channels,
    flags: { subscriptionsCheckEnabled, eventsEnabled, notificationsEnabled, paymentsEnabled },
    limits: {
      cooldownSeconds:
        Number.isFinite(cooldownSecondsFromRemote) && (cooldownSecondsFromRemote as number) >= 0
          ? (cooldownSecondsFromRemote as number)
          : fallback.limits.cooldownSeconds
    }
  };
}

export async function fetchRemoteConfig(apiBaseUrl: string): Promise<RemoteBotConfigRaw> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/bot/config`;
  const response = await axios.get(url, { timeout: 5000 });
  return response.data as RemoteBotConfigRaw;
}

export async function tryFetchRemoteConfig(apiBaseUrl: string): Promise<RemoteBotConfigRaw | null> {
  try {
    return await fetchRemoteConfig(apiBaseUrl);
  } catch (error) {
    logRateLimited("warn", "remoteConfig.unavailable", `API unavailable → using cached config (${formatAxiosLikeError(error)})`, 60_000);
    return null;
  }
}
