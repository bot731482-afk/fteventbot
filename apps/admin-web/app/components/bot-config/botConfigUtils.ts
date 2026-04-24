import { defaultBotConfigV1, type BotConfigV1 } from "@eon/shared-domain";

/** t.me/... → https://t.me/... for Zod .url() */
export function normalizeInviteLink(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(t\.me|telegram\.me)\//i.test(t)) return `https://${t}`;
  if (/^@?[a-zA-Z0-9_]+$/i.test(t) && !t.includes("/")) return `https://t.me/${t.replace(/^@/, "")}`;
  return t;
}

function stripEmptyOptionalContent(c: BotConfigV1["content"]): BotConfigV1["content"] {
  const opt = (s: string | undefined): string | undefined => {
    const t = (s ?? "").trim();
    return t.length ? t : undefined;
  };
  return {
    ...c,
    subscriptionCheckFailedMessage: opt(c.subscriptionCheckFailedMessage),
    limitReachedMessage: opt(c.limitReachedMessage),
    cooldownActiveMessage: opt(c.cooldownActiveMessage)
  };
}

export function normalizeDraftForSave(draft: BotConfigV1): BotConfigV1 {
  const channels = draft.channels.map((ch) => ({
    ...ch,
    title: ch.title.trim(),
    username: ch.username.trim(),
    inviteLink: normalizeInviteLink(ch.inviteLink),
    tgChannelId: ch.tgChannelId?.trim() ? ch.tgChannelId.trim() : undefined
  }));
  const contentMerged = {
    ...defaultBotConfigV1.content,
    ...draft.content
  };
  return {
    ...draft,
    channels,
    content: stripEmptyOptionalContent(contentMerged),
    limits: {
      ...defaultBotConfigV1.limits,
      ...draft.limits
    }
  };
}

/** Stable serialization for dirty detection (after merge + invite normalization). */
export function serializeBotConfigState(c: BotConfigV1): string {
  return JSON.stringify(normalizeDraftForSave(c));
}

export type ZodIssueLike = { path: (string | number)[]; message: string };

export function groupValidationIssues(issues: ZodIssueLike[]): string[] {
  const lines: string[] = [];
  for (const i of issues) {
    const p = i.path.join(".") || "(root)";
    let section = "Общее";
    if (p === "(root)" || p.startsWith("content")) section = "Сообщения бота";
    else if (p.startsWith("menuButtons")) section = "Кнопки меню";
    else if (p.startsWith("channels")) section = "Обязательные каналы";
    else if (p.startsWith("flags")) section = "Включение функций";
    else if (p.startsWith("limits")) section = "Лимиты";
    lines.push(`[${section}] ${p}: ${i.message}`);
  }
  return lines;
}
