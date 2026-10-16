import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/discord : modal « Rejoins notre Discord » et bonus de liaison du compte.

export const DISCORD_SETTING_KEYS = ["discord.joinModal", "discord.linkBonusZeni"] as const satisfies readonly SettingKey[];

export type DiscordSettingKey = (typeof DISCORD_SETTING_KEYS)[number];
export type DiscordSettings = SettingsOf<DiscordSettingKey>;

export const discordSettingsSchema = settingsSchemaFor(DISCORD_SETTING_KEYS);
