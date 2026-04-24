import { z } from "zod";

export const BotConfigV1Schema = z.object({
  content: z.object({
    startMessage: z.string().min(1),
    subscriptionRequiredMessage: z.string().min(1),
    eventsUnavailableMessage: z.string().min(1),
    supportMessage: z.string().min(1),
    subscriptionCheckFailedMessage: z.string().min(1).optional(),
    limitReachedMessage: z.string().min(1).optional(),
    cooldownActiveMessage: z.string().min(1).optional()
  }),
  menuButtons: z.object({
    main: z.array(z.string().min(1)).min(1),
    afterSubscription: z.array(z.string().min(1)).min(1)
  }),
  channels: z
    .array(
      z.object({
        title: z.string().min(1),
        username: z.string().min(1),
        inviteLink: z.string().url(),
        isRequired: z.boolean(),
        isActive: z.boolean(),
        tgChannelId: z.string().min(1).optional()
      })
    )
    .default([]),
  flags: z.object({
    subscriptionsCheckEnabled: z.boolean(),
    eventsEnabled: z.boolean(),
    notificationsEnabled: z.boolean(),
    paymentsEnabled: z.boolean()
  }),
  limits: z.object({
    cooldownSeconds: z.number().int().min(0).max(3600),
    dailyEventViewsMax: z.number().int().min(0).max(100000).default(30),
    subscriptionRecheckMinSeconds: z.number().int().min(0).max(3600).default(3)
  })
});

export type BotConfigV1 = z.infer<typeof BotConfigV1Schema>;

export const defaultBotConfigV1: BotConfigV1 = {
  content: {
    startMessage: "Добро пожаловать в Event Helper",
    subscriptionRequiredMessage: "Для использования бота подпишитесь на обязательные каналы",
    eventsUnavailableMessage: "Сервис ивентов временно недоступен, попробуйте позже",
    supportMessage: "По всем вопросам: @support",
    subscriptionCheckFailedMessage:
      "Не удалось проверить подписку. Попробуйте кнопку «Проверить подписку» снова чуть позже.",
    limitReachedMessage: "Сегодняшний лимит просмотров исчерпан. Завтра снова будет доступ.",
    cooldownActiveMessage: "Слишком часто. Подожди немного и попробуй снова."
  },
  menuButtons: {
    main: ["Профиль", "События", "Поддержка"],
    afterSubscription: ["Открыть события", "Профиль"]
  },
  channels: [],
  flags: {
    subscriptionsCheckEnabled: true,
    eventsEnabled: true,
    notificationsEnabled: true,
    paymentsEnabled: false
  },
  limits: { cooldownSeconds: 10, dailyEventViewsMax: 30, subscriptionRecheckMinSeconds: 3 }
};

export function validateBotConfigV1(input: unknown): BotConfigV1 {
  const parsed = BotConfigV1Schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid BotConfigV1: ${issues}`);
  }
  return parsed.data;
}

