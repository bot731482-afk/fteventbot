import axios from "axios";
import { type BotConfigV1, validateBotConfigV1 } from "@eon/shared-domain";
import { formatAxiosLikeError } from "./logger";

export type RemoteBotConfigRaw = unknown;

export async function fetchRemoteConfig(apiBaseUrl: string): Promise<BotConfigV1> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/bot/config`;
  const response = await axios.get(url, { timeout: 5000 });
  return validateBotConfigV1(response.data);
}

export type RemoteConfigFetchResult = { config: BotConfigV1 } | { config: null; error: string };

export async function tryFetchRemoteConfig(apiBaseUrl: string): Promise<RemoteConfigFetchResult> {
  try {
    return { config: await fetchRemoteConfig(apiBaseUrl) };
  } catch (error) {
    return { config: null, error: formatAxiosLikeError(error) };
  }
}
