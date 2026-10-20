import type { SettingKey } from "./defaults";
import { changedSettingKeys, settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/social : amis, cadeaux, échanges, chat et notifications.

export const SOCIAL_SETTING_KEYS = [
  "social.enabled",
  "friends.max",
  "friends.maxOutgoingPending",
  "friends.requestCooldownHours",
  "gifts.enabled",
  "gifts.perDaySent",
  "gifts.perDayReceived",
  "gifts.minAccountAgeHours",
  "gifts.minFriendshipHours",
  "gifts.boosterPriceZeni",
  "gifts.allowedRarities",
  "trades.enabled",
  "trades.expiryHours",
  "trades.maxOffered",
  "trades.maxPendingSent",
  "trades.perDay",
  "trades.allowedRarities",
  "chat.enabled",
  "chat.maxLength",
  "chat.perMinute",
  "chat.retentionHours",
  "chat.pollSeconds",
  "notifications.retentionDays",
  "notifications.pollSeconds",
  "notifications.pushEnabled",
] as const satisfies readonly SettingKey[];

export type SocialSettingKey = (typeof SOCIAL_SETTING_KEYS)[number];

export type SocialSettings = SettingsOf<SocialSettingKey>;

export const socialSettingsSchema = settingsSchemaFor(SOCIAL_SETTING_KEYS);

export function changedSocialKeys(before: SocialSettings, after: SocialSettings): SocialSettingKey[] {
  return changedSettingKeys(SOCIAL_SETTING_KEYS, before, after);
}
