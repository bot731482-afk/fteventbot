export interface BotConfigV1 {
  content: {
    startMessage: string;
    subscriptionRequiredMessage: string;
    eventsUnavailableMessage: string;
    supportMessage: string;
  };
  menuButtons: {
    main: string[];
    afterSubscription: string[];
  };
  channels: Array<{
    title: string;
    username: string | null;
    inviteLink: string | null;
    isRequired: boolean;
    isActive: boolean;
    tgChannelId: string | null;
  }>;
  flags: {
    subscriptionsCheckEnabled: boolean;
    eventsEnabled: boolean;
    notificationsEnabled: boolean;
    paymentsEnabled: boolean;
  };
  limits: {
    cooldownSeconds: number;
  };
}

