"use server";

import { updateTag } from "next/cache";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { BOOSTER_SETTING_KEYS, boosterSettingsSchema, type BoosterSettingKey } from "@/lib/settings/booster-form";
import {
  COLLECTION_SETTING_KEYS,
  collectionSettingsSchema,
  type CollectionSettingKey,
} from "@/lib/settings/collection-form";
import { parseSetting, type SettingKey } from "@/lib/settings/defaults";
import { COMBAT_SETTING_KEYS, combatSettingsSchema, type CombatSettingKey } from "@/lib/settings/combat-form";
import { DISCORD_SETTING_KEYS, discordSettingsSchema, type DiscordSettingKey } from "@/lib/settings/discord-form";
import { FEATURE_SETTING_KEYS, featureSettingsSchema, type FeatureSettingKey } from "@/lib/settings/features-form";
import { GENERAL_SETTING_KEYS, generalSettingsSchema, type GeneralSettingKey } from "@/lib/settings/general-form";
import { ECONOMY_SETTING_KEYS, economySettingsSchema, type EconomySettingKey } from "@/lib/settings/economy-form";
import { RANKED_FORM_KEYS, rankedSettingsSchema, type RankedSettingKey } from "@/lib/settings/ranked-form";
import { MARKET_SETTING_KEYS, marketSettingsSchema, type MarketSettingKey } from "@/lib/settings/market-form";
import { SOCIAL_SETTING_KEYS, socialSettingsSchema, type SocialSettingKey } from "@/lib/settings/social-form";
import { changedSettingKeys, type SettingsOf } from "@/lib/settings/form";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { SETTINGS_TAG } from "../settings";
import { writeAdminLog } from "../admin/log";

// Réglages de jeu depuis /admin. Ordre : rôle admin vérifié → Zod par clé → rate limit.
// Chaque clé modifiée écrit sa ligne GameSetting et une ligne AdminLog (avant / après).

export type UpdateSettingsResult<K extends SettingKey = SettingKey> =
  | { ok: true; changed: K[] }
  | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" };

async function saveSettings<K extends SettingKey>(
  keys: readonly K[],
  schema: z.ZodType,
  input: unknown,
): Promise<UpdateSettingsResult<K>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const next = parsed.data as SettingsOf<K>;

  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const changed = await prisma.$transaction(async (tx) => {
    // Valeurs en vigueur lues en base (pas dans le cache) : l'avant du journal est exact
    const rows = await tx.gameSetting.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const before = Object.fromEntries(keys.map((k) => [k, parseSetting(k, stored.get(k))])) as SettingsOf<K>;

    const changedKeys = changedSettingKeys(keys, before, next);
    for (const key of changedKeys) {
      const value = next[key] as Prisma.InputJsonValue;
      await tx.gameSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: admin.id },
        update: { value, updatedBy: admin.id },
      });
      await writeAdminLog(tx, {
        adminId: admin.id,
        action: "SETTING_UPDATE",
        targetType: "GameSetting",
        targetId: key,
        before: before[key] as Prisma.InputJsonValue,
        after: value,
      });
    }
    return changedKeys;
  });

  // Effet immédiat dans tout le jeu, sans redéployer
  if (changed.length > 0) updateTag(SETTINGS_TAG);
  return { ok: true, changed };
}

export async function updateBoosterSettings(input: unknown): Promise<UpdateSettingsResult<BoosterSettingKey>> {
  return saveSettings(BOOSTER_SETTING_KEYS, boosterSettingsSchema, input);
}

export async function updateCollectionSettings(input: unknown): Promise<UpdateSettingsResult<CollectionSettingKey>> {
  return saveSettings(COLLECTION_SETTING_KEYS, collectionSettingsSchema, input);
}

export async function updateSocialSettings(input: unknown): Promise<UpdateSettingsResult<SocialSettingKey>> {
  return saveSettings(SOCIAL_SETTING_KEYS, socialSettingsSchema, input);
}

export async function updateEconomySettings(input: unknown): Promise<UpdateSettingsResult<EconomySettingKey>> {
  if (!(await getAdmin())) return { ok: false, error: "FORBIDDEN" };
  const parsed = economySettingsSchema.safeParse(input);
  // Un lot de parrainage doit exister : sinon la réclamation échouerait chez les joueurs
  if (parsed.success) {
    const lotIds = [parsed.data["referral.referrerLotId"], parsed.data["referral.refereeLotId"]].filter(
      (id): id is string => id !== null,
    );
    if (lotIds.length > 0) {
      const found = await prisma.lot.count({ where: { id: { in: [...new Set(lotIds)] } } });
      if (found !== new Set(lotIds).size) return { ok: false, error: "INVALID" };
    }
  }
  return saveSettings(ECONOMY_SETTING_KEYS, economySettingsSchema, input);
}

export async function updateMarketSettings(input: unknown): Promise<UpdateSettingsResult<MarketSettingKey>> {
  return saveSettings(MARKET_SETTING_KEYS, marketSettingsSchema, input);
}

export async function updateCombatSettings(input: unknown): Promise<UpdateSettingsResult<CombatSettingKey>> {
  return saveSettings(COMBAT_SETTING_KEYS, combatSettingsSchema, input);
}

export async function updateRankedSettings(input: unknown): Promise<UpdateSettingsResult<RankedSettingKey>> {
  if (!(await getAdmin())) return { ok: false, error: "FORBIDDEN" };
  const parsed = rankedSettingsSchema.safeParse(input);
  // Chaque lot de fin de saison doit exister : sinon la réclamation échouerait chez les joueurs
  if (parsed.success) {
    const lotIds = [...new Set(Object.values(parsed.data["ranked.rewardLots"]).filter((id): id is string => id !== null))];
    if (lotIds.length > 0 && (await prisma.lot.count({ where: { id: { in: lotIds } } })) !== lotIds.length) {
      return { ok: false, error: "INVALID" };
    }
  }
  return saveSettings(RANKED_FORM_KEYS, rankedSettingsSchema, input);
}

export async function updateDiscordSettings(input: unknown): Promise<UpdateSettingsResult<DiscordSettingKey>> {
  return saveSettings(DISCORD_SETTING_KEYS, discordSettingsSchema, input);
}

export async function updateFeatureSettings(input: unknown): Promise<UpdateSettingsResult<FeatureSettingKey>> {
  return saveSettings(FEATURE_SETTING_KEYS, featureSettingsSchema, input);
}

export async function updateGeneralSettings(input: unknown): Promise<UpdateSettingsResult<GeneralSettingKey>> {
  return saveSettings(GENERAL_SETTING_KEYS, generalSettingsSchema, input);
}
