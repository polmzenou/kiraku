import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/discord : annonces du marché et des saisons, accueil (modal et section de
// la page Social) et bonus de liaison.

export const DISCORD_SETTING_KEYS = [
  "discord.joinModal",
  "discord.socialPromo",
  "discord.linkBonusZeni",
  "discord.marketEnabled",
  "discord.rankedEnabled",
] as const satisfies readonly SettingKey[];

export type DiscordSettingKey = (typeof DISCORD_SETTING_KEYS)[number];
export type DiscordSettings = SettingsOf<DiscordSettingKey>;

export const discordSettingsSchema = settingsSchemaFor(DISCORD_SETTING_KEYS);
