import axios from "axios";
import { type BotConfigV1, validateBotConfigV1 } from "@eon/shared-domain";
import { formatAxiosLikeError, logRateLimited } from "./logger";

export type RemoteBotConfigRaw = unknown;

export async function fetchRemoteConfig(apiBaseUrl: string): Promise<BotConfigV1> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/bot/config`;
  const response = await axios.get(url, { timeout: 5000 });
  return validateBotConfigV1(response.data);
}

export async function tryFetchRemoteConfig(apiBaseUrl: string): Promise<BotConfigV1 | null> {
  try {
    return await fetchRemoteConfig(apiBaseUrl);
  } catch (error) {
    logRateLimited("warn", "remoteConfig.unavailable", `API unavailable → using cached config (${formatAxiosLikeError(error)})`, 60_000);
    return null;
  }
}
