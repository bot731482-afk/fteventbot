export type EventType = "all" | "system" | "user";

export type FunTimeServerCode = string;

export interface FunTimeEvent {
  eventName: string;
  timeLeftSec: number;
}

export interface ServerEvents {
  server: FunTimeServerCode;
  events: FunTimeEvent[];
}

export interface EventsSnapshot {
  fetchedAt: string;
  stale: boolean;
  items: ServerEvents[];
}

export type PlanKind = "views" | "unlimited_lifetime";

export type EntitlementType = "free_pack" | "paid_pack" | "unlimited_lifetime";

export interface NearestEventView {
  server: string;
  nearestTimeLeftSec: number;
  displayLabel: string;
}

export interface UserNotificationRule {
  userId: string;
  serverCode: string;
  notifyBeforeMinutes: 1 | 3 | 5;
  isActive: boolean;
}

export { BotConfigV1Schema, defaultBotConfigV1, validateBotConfigV1 } from "./botConfig";
export type { BotConfigV1 } from "./botConfig";
