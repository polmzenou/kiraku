"use server";

import { updateTag } from "next/cache";
import { z } from "@/lib/zod";
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
import { NEWS_MAX_ITEMS, nextPublication, validNewsImageUrl, type NewsVisuals } from "@/lib/home/news";
import { newsVisualSchema } from "@/lib/home/news-schema";
import { NEWS_SETTING_KEYS, newsSettingsSchema, type NewsSettingKey } from "@/lib/settings/news-form";
import { FEATURE_SETTING_KEYS, featureSettingsSchema, type FeatureSettingKey } from "@/lib/settings/features-form";
import { GENERAL_SETTING_KEYS, generalSettingsSchema, type GeneralSettingKey } from "@/lib/settings/general-form";
import { PULL_FEED_SETTING_KEYS, pullFeedSettingsSchema, type PullFeedSettingKey } from "@/lib/settings/pull-feed-form";
import { USAGE_SETTING_KEYS, usageSettingsSchema, type UsageSettingKey } from "@/lib/settings/usage-form";
import { ECONOMY_SETTING_KEYS, economySettingsSchema, type EconomySettingKey } from "@/lib/settings/economy-form";
import { RANKED_FORM_KEYS, rankedSettingsSchema, type RankedSettingKey } from "@/lib/settings/ranked-form";
import { MARKET_SETTING_KEYS, marketSettingsSchema, type MarketSettingKey } from "@/lib/settings/market-form";
import { SOCIAL_SETTING_KEYS, socialSettingsSchema, type SocialSettingKey } from "@/lib/settings/social-form";
import { PROFILE_SETTING_KEYS, profileSettingsSchema, type ProfileSettingKey } from "@/lib/settings/profile-form";
import { AMBASSADOR_SETTING_KEYS, ambassadorSettingsSchema, type AmbassadorSettingKey } from "@/lib/settings/ambassador-form";
import { changedSettingKeys, type SettingsOf } from "@/lib/settings/form";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { forgetSettings, SETTINGS_TAG } from "../settings";
import { writeAdminLog } from "../admin/log";
import { getRarities } from "../catalog/rarities";
import { resolveNewsVisuals } from "../home/news";

// Réglages de jeu depuis /admin. Ordre : rôle admin vérifié → Zod par clé → rate limit.
// Chaque clé modifiée écrit sa ligne GameSetting et une ligne AdminLog (avant / après).

export type UpdateSettingsResult<K extends SettingKey = SettingKey> =
  | { ok: true; changed: K[] }
  | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" };

async function saveSettings<K extends SettingKey>(
  keys: readonly K[],
  schema: z.ZodType,
  input: unknown,
  // Champs que le serveur décide d'après les valeurs en vigueur, lues dans la transaction
  finalize?: (next: SettingsOf<K>, before: SettingsOf<K>) => SettingsOf<K>,
): Promise<UpdateSettingsResult<K>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const next = parsed.data as SettingsOf<K>;
  const rarityKeys = ["booster.rates", "collection.recycleValues", "battle.keywordsByRarity", "booster.slotFloors", "booster.goldenFloor", "gifts.allowedRarities", "trades.allowedRarities", "home.pullFeed.minRarity", "market.maxPriceByRarity", "booster.duplicateGuardRarities"];
  if (keys.some((k) => rarityKeys.includes(k))) {
    const registry = await getRarities();
    for (const key of keys.filter((k) => rarityKeys.includes(k))) {
      const value = next[key];
      const selected = typeof value === "string" ? [value] : Array.isArray(value) ? value : Object.keys(value as object);
      if (selected.some((r) => !registry.includes(String(r)))) return { ok: false, error: "INVALID" };
      if (["booster.rates", "collection.recycleValues", "battle.keywordsByRarity"].includes(key) && selected.length !== registry.length) return { ok: false, error: "INVALID" };
    }
  }

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
    const after = finalize ? (schema.parse(finalize(next, before)) as SettingsOf<K>) : next;

    const changedKeys = changedSettingKeys(keys, before, after);
    for (const key of changedKeys) {
      const value = after[key] as Prisma.InputJsonValue;
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
  if (changed.length > 0) {
    updateTag(SETTINGS_TAG);
    forgetSettings();
  }
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

export async function updateProfileSettings(input: unknown): Promise<UpdateSettingsResult<ProfileSettingKey>> {
  return saveSettings(PROFILE_SETTING_KEYS, profileSettingsSchema, input);
}

export async function updateAmbassadorSettings(input: unknown): Promise<UpdateSettingsResult<AmbassadorSettingKey>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = ambassadorSettingsSchema.safeParse(input);
  // Limité avant la vérification du type en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  // Le pack donne des boosters à ouvrir : le type doit exister et ne pas être un sachet scellé
  if (parsed.success) {
    const type = await prisma.boosterType.findUnique({ where: { slug: parsed.data["ambassador.weeklyBoosterSlug"] }, select: { kind: true } });
    if (!type || type.kind === "DROP") return { ok: false, error: "INVALID" };
  }
  return saveSettings(AMBASSADOR_SETTING_KEYS, ambassadorSettingsSchema, input);
}

export async function updateEconomySettings(input: unknown): Promise<UpdateSettingsResult<EconomySettingKey>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = economySettingsSchema.safeParse(input);
  // Limité avant la vérification des lots en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  // Un lot de parrainage doit exister : sinon la réclamation échouerait chez les joueurs
  if (parsed.success) {
    const lotIds = [
      parsed.data["referral.referrerLotId"],
      parsed.data["referral.refereeLotId"],
      ...parsed.data["referral.milestones"].map((m) => m.lotId),
    ].filter((id): id is string => id !== null);
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
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = rankedSettingsSchema.safeParse(input);
  // Limité avant la vérification des lots en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
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

/**
 * Encart « Nouveautés » : le contenu vient de l'admin, la révision et la date de publication du serveur.
 * `reopen` (seulement `true` explicite) passe à la révision suivante et rouvre l'encart chez tous les joueurs.
 */
export async function updateNewsSettings(input: unknown, reopen: unknown): Promise<UpdateSettingsResult<NewsSettingKey>> {
  if (!(await getAdmin())) return { ok: false, error: "FORBIDDEN" };
  // Images de bannière : seulement celles téléversées dans le stockage du site (/api/admin/nouveautes/upload)
  const parsed = newsSettingsSchema.safeParse(input);
  const foreign = parsed.success && parsed.data["home.news"].items.some((i) => i.visual.kind === "image" && !validNewsImageUrl(i.visual.url, process.env.BLOB_PUBLIC_HOST));
  if (foreign) return { ok: false, error: "INVALID" };
  return saveSettings(NEWS_SETTING_KEYS, newsSettingsSchema, input, (next, before) => ({
    "home.news": nextPublication(before["home.news"], next["home.news"], reopen === true, new Date()),
  }));
}

const previewSchema = z
  .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,24}$/), visual: newsVisualSchema }).strict())
  .max(NEWS_MAX_ITEMS);

/** Aperçu de l'admin : les visuels (cartes, boosters) des nouveautés du brouillon, comme sur l'accueil. */
export async function previewNewsVisuals(input: unknown, locale: unknown): Promise<NewsVisuals> {
  const admin = await getAdmin();
  if (!admin) return {};
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return {};
  // Rappelé à chaque changement de visuel : même bucket que les recherches à la frappe
  if (!(await rateLimit(`admin-search:${admin.id}`, { limit: 60, windowSeconds: 60 })).success) return {};
  return resolveNewsVisuals(parsed.data, locale === "en" ? "en" : "fr");
}

export async function updateFeatureSettings(input: unknown): Promise<UpdateSettingsResult<FeatureSettingKey>> {
  return saveSettings(FEATURE_SETTING_KEYS, featureSettingsSchema, input);
}

export async function updateGeneralSettings(input: unknown): Promise<UpdateSettingsResult<GeneralSettingKey>> {
  return saveSettings(GENERAL_SETTING_KEYS, generalSettingsSchema, input);
}

export async function updatePullFeedSettings(input: unknown): Promise<UpdateSettingsResult<PullFeedSettingKey>> {
  return saveSettings(PULL_FEED_SETTING_KEYS, pullFeedSettingsSchema, input);
}

export async function updateUsageSettings(input: unknown): Promise<UpdateSettingsResult<UsageSettingKey>> {
  return saveSettings(USAGE_SETTING_KEYS, usageSettingsSchema, input);
}
