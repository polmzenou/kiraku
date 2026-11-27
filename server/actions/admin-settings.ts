"use server";

import { updateTag } from "next/cache";
import { z } from "@/lib/zod";
import { Prisma } from "@/generated/prisma/client";
import { BOOSTER_SETTING_KEYS, boosterSettingsSchema, type BoosterSettingKey } from "@/lib/settings/booster-form";
import {
  COLLECTION_SETTING_KEYS,
  collectionSettingsSchema,
  type CollectionSettingKey,
} from "@/lib/settings/collection-form";
import { parseSetting, RARITY_KEYED, type SettingKey } from "@/lib/settings/defaults";
import { COMBAT_SETTING_KEYS, combatSettingsSchema, type CombatSettingKey } from "@/lib/settings/combat-form";
import { DISCORD_SETTING_KEYS, discordSettingsSchema, type DiscordSettingKey } from "@/lib/settings/discord-form";
import { NEWS_MAX_ITEMS, nextPublication, validNewsImageUrl, type NewsVisuals } from "@/lib/home/news";
import { newsVisualSchema } from "@/lib/home/news-schema";
import { NEWS_SETTING_KEYS, newsSettingsSchema, type NewsSettingKey } from "@/lib/settings/news-form";
import { FEATURE_SETTING_KEYS, featureSettingsSchema, type FeatureSettingKey } from "@/lib/settings/features-form";
import { GENERAL_SETTING_KEYS, generalSettingsSchema, type GeneralSettingKey } from "@/lib/settings/general-form";
import { PULL_FEED_SETTING_KEYS, pullFeedSettingsSchema, type PullFeedSettingKey } from "@/lib/settings/pull-feed-form";
import { EVENT_GAUGE_SETTING_KEYS, eventGaugeSettingsSchema, type EventGaugeSettingKey } from "@/lib/settings/event-gauge-form";
import { WRAPPED_SETTING_KEYS, wrappedSettingsSchema, type WrappedSettingKey } from "@/lib/settings/wrapped-form";
import { SHOWCASE_EVENT_SETTING_KEYS, showcaseEventSettingsSchema, type ShowcaseEventSettingKey } from "@/lib/settings/showcase-event-form";
import { EXPEDITION_SETTING_KEYS, expeditionSettingsSchema, type ExpeditionSettingKey } from "@/lib/settings/expedition-form";
import { PRESTIGE_SETTING_KEYS, prestigeSettingsSchema, type PrestigeSettingKey } from "@/lib/settings/prestige-form";
import { USAGE_SETTING_KEYS, usageSettingsSchema, type UsageSettingKey } from "@/lib/settings/usage-form";
import { ECONOMY_SETTING_KEYS, economySettingsSchema, type EconomySettingKey } from "@/lib/settings/economy-form";
import { RANKED_FORM_KEYS, rankedSettingsSchema, type RankedSettingKey } from "@/lib/settings/ranked-form";
import { MARKET_SETTING_KEYS, marketSettingsSchema, type MarketSettingKey } from "@/lib/settings/market-form";
import { SOCIAL_SETTING_KEYS, socialSettingsSchema, type SocialSettingKey } from "@/lib/settings/social-form";
import { PROFILE_SETTING_KEYS, profileSettingsSchema, type ProfileSettingKey } from "@/lib/settings/profile-form";
import { ACHIEVEMENT_SETTING_KEYS, achievementSettingsSchema, type AchievementSettingKey } from "@/lib/settings/achievements-form";
import { normalizeGoals } from "@/lib/achievements/evaluate";
import { AMBASSADOR_SETTING_KEYS, ambassadorSettingsSchema, type AmbassadorSettingKey } from "@/lib/settings/ambassador-form";
import {
  normalizeThemes,
  SHOWCASE_SETTING_KEYS,
  showcaseSettingsSchema,
  themeConditionRarities,
  type ShowcaseSettingKey,
} from "@/lib/settings/showcase-form";
import { CASINO_FORM_KEYS, casinoSettingsSchema, type CasinoFormKey } from "@/lib/settings/casino-form";
import { KYARA_FORM_KEYS, kyaraSettingsSchema, type KyaraFormKey } from "@/lib/settings/kyara-form";
import { REFERRAL_V2_FORM_KEYS, referralV2SettingsSchema, type ReferralV2FormKey } from "@/lib/settings/referral-v2-form";
import { ENNICHI_FORM_KEYS, ennichiSettingsSchema, type EnnichiFormKey } from "@/lib/settings/ennichi-form";
import {
  changedSettingKeys,
  mergeSettingsSubmission,
  settingsSubmissionSchema,
  type SettingsOf,
  type SettingsSubmission,
} from "@/lib/settings/form";
import { canManageReferrals, canProcessKyaraImports } from "@/lib/admin/roles";
import { getAdmin, getStaff } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { forgetSettings, SETTINGS_TAG } from "../settings";
import { writeAdminLog } from "../admin/log";
import { getRarities } from "../catalog/rarities";
import { resolveNewsVisuals } from "../home/news";
import { ENNICHI_TAG, forgetEnnichiView } from "../ennichi/tag";
import { isRewardableKind } from "@/lib/boosters/types";

// Réglages de jeu depuis /admin. Ordre : rôle admin vérifié → Zod par clé → rate limit.
// Chaque formulaire envoie { base, draft } (SettingsSubmission, lib/settings/form.ts) : seules les clés modifiées à
// l'écran s'écrivent, chacune avec sa ligne GameSetting et une ligne AdminLog (avant / après) ; une clé modifiée qui a
// changé en base depuis l'ouverture de la page fait refuser l'enregistrement (STALE).
// Exceptions au rôle admin, ouvertes à toute l'équipe : les réglages de l'import Kyara (kyaraStaff), ceux du
// parrainage v2 et ceux de l'Ennichi (referralStaff).

export type UpdateSettingsResult<K extends SettingKey = SettingKey> =
  | { ok: true; changed: K[] }
  | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "STALE" };

/** Brouillon d'un envoi, pour les contrôles propres à une action avant saveSettings ; null si l'envoi est invalide. */
function draftOf<K extends SettingKey>(keys: readonly K[], schema: z.ZodType, input: unknown): SettingsOf<K> | null {
  const parsed = settingsSubmissionSchema(keys, schema).safeParse(input);
  return parsed.success ? (parsed.data.draft as SettingsOf<K>) : null;
}

async function saveSettings<K extends SettingKey>(
  keys: readonly K[],
  schema: z.ZodType,
  input: unknown,
  {
    finalize,
    editor,
    holds,
  }: {
    // Champs que le serveur décide d'après les valeurs en vigueur, lues dans la transaction
    finalize?: (next: SettingsOf<K>, before: SettingsOf<K>) => SettingsOf<K>;
    // Qui peut enregistrer, si ce n'est pas l'admin seul
    editor?: () => Promise<{ id: string } | null>;
    // Règle propre à l'action sur les valeurs qui seront en vigueur (brouillon appliqué sur la base), hors schéma
    holds?: (after: SettingsOf<K>) => boolean;
  } = {},
): Promise<UpdateSettingsResult<K>> {
  const admin = editor ? await editor() : await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };

  const parsed = settingsSubmissionSchema(keys, schema).safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const submission = parsed.data as SettingsSubmission<K>;
  const next = submission.draft;
  const rarityKeyed = keys.filter((k) => RARITY_KEYED[k]);
  if (rarityKeyed.length > 0) {
    const registry = await getRarities();
    for (const key of rarityKeyed) {
      const value = next[key];
      const selected = typeof value === "string" ? [value] : Array.isArray(value) ? value : Object.keys(value as object);
      if (selected.some((r) => !registry.includes(String(r)))) return { ok: false, error: "INVALID" };
      if (RARITY_KEYED[key] === "all" && selected.length !== registry.length) return { ok: false, error: "INVALID" };
    }
  }

  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    // Lignes du formulaire verrouillées (ordre fixe) : deux enregistrements simultanés ne se croisent pas entre la
    // vérification du conflit et l'écriture
    await tx.$queryRaw`SELECT key FROM "GameSetting" WHERE key IN (${Prisma.join([...keys])}) ORDER BY key FOR UPDATE`;
    // Valeurs en vigueur lues en base (pas dans le cache) : l'avant du journal et le conflit sont exacts
    const rows = await tx.gameSetting.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const before = Object.fromEntries(keys.map((k) => [k, parseSetting(k, stored.get(k))])) as SettingsOf<K>;

    // Seules les clés modifiées à l'écran prennent la valeur du brouillon ; les autres gardent la valeur en base
    const merge = mergeSettingsSubmission(keys, submission, before);
    if (!merge.ok) return { stale: true } as const;
    // Contrôles croisés du schéma sur ce qui sera en vigueur : le brouillon seul était valide, un échec vient donc
    // d'un autre réglage du formulaire changé entre-temps
    const checked = schema.safeParse(merge.merged);
    if (!checked.success) return { stale: true } as const;
    const merged = checked.data as SettingsOf<K>;
    const after = finalize ? (schema.parse(finalize(merged, before)) as SettingsOf<K>) : merged;
    if (holds && !holds(after)) return { stale: true } as const;

    // Jamais une clé non modifiée à l'écran, même si finalize la retouche
    const changedKeys = changedSettingKeys(merge.edited, before, after);
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
    return { stale: false, changed: changedKeys } as const;
  });

  // Effet immédiat dans tout le jeu, sans redéployer. Conflit : la page lisait peut-être un cache périmé (réglage
  // écrit par un script) ; il est oublié aussi pour que la page rechargée montre les valeurs en base
  if (outcome.stale || outcome.changed.length > 0) {
    updateTag(SETTINGS_TAG);
    forgetSettings();
  }
  return outcome.stale ? { ok: false, error: "STALE" } : { ok: true, changed: outcome.changed };
}

export async function updateBoosterSettings(input: unknown): Promise<UpdateSettingsResult<BoosterSettingKey>> {
  return saveSettings(BOOSTER_SETTING_KEYS, boosterSettingsSchema, input);
}

export async function updateCollectionSettings(input: unknown): Promise<UpdateSettingsResult<CollectionSettingKey>> {
  return saveSettings(COLLECTION_SETTING_KEYS, collectionSettingsSchema, input);
}

/**
 * Vitrines : nombre par joueur, statut et condition de chaque thème. Une condition ne cite qu'une rareté
 * du registre (sinon le thème ne se débloquerait jamais) ; Sans décor reste toujours disponible et libre.
 */
export async function updateShowcaseSettings(input: unknown): Promise<UpdateSettingsResult<ShowcaseSettingKey>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const draft = draftOf(SHOWCASE_SETTING_KEYS, showcaseSettingsSchema, input);
  // Limité avant la lecture du registre des raretés (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  if (draft) {
    const registry = await getRarities();
    if (themeConditionRarities(draft["showcase.themes"]).some((r) => !registry.includes(r))) return { ok: false, error: "INVALID" };
  }
  return saveSettings(SHOWCASE_SETTING_KEYS, showcaseSettingsSchema, input, {
    finalize: (next) => ({ ...next, "showcase.themes": normalizeThemes(next["showcase.themes"]) }),
  });
}

export async function updateSocialSettings(input: unknown): Promise<UpdateSettingsResult<SocialSettingKey>> {
  return saveSettings(SOCIAL_SETTING_KEYS, socialSettingsSchema, input);
}

export async function updateProfileSettings(input: unknown): Promise<UpdateSettingsResult<ProfileSettingKey>> {
  return saveSettings(PROFILE_SETTING_KEYS, profileSettingsSchema, input);
}

/** Succès : seuils figés ou égaux au défaut du catalogue écartés (le catalogue fait foi quand rien n'est réglé). */
export async function updateAchievementSettings(input: unknown): Promise<UpdateSettingsResult<AchievementSettingKey>> {
  return saveSettings(ACHIEVEMENT_SETTING_KEYS, achievementSettingsSchema, input, {
    finalize: (next) => ({ ...next, "achievements.goals": normalizeGoals(next["achievements.goals"]) }),
  });
}

export async function updateAmbassadorSettings(input: unknown): Promise<UpdateSettingsResult<AmbassadorSettingKey>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const draft = draftOf(AMBASSADOR_SETTING_KEYS, ambassadorSettingsSchema, input);
  // Limité avant la vérification du type en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  // Le pack donne des boosters à ouvrir : le type doit exister et ne pas être un sachet scellé
  if (draft) {
    const type = await prisma.boosterType.findUnique({ where: { slug: draft["ambassador.weeklyBoosterSlug"] }, select: { kind: true } });
    if (!type || !isRewardableKind(type.kind)) return { ok: false, error: "INVALID" };
  }
  return saveSettings(AMBASSADOR_SETTING_KEYS, ambassadorSettingsSchema, input);
}

export async function updateEconomySettings(input: unknown): Promise<UpdateSettingsResult<EconomySettingKey>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const draft = draftOf(ECONOMY_SETTING_KEYS, economySettingsSchema, input);
  // Limité avant la vérification des lots en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  // Un lot de parrainage doit exister : sinon la réclamation échouerait chez les joueurs
  if (draft) {
    const lotIds = [
      draft["referral.referrerLotId"],
      draft["referral.refereeLotId"],
      ...draft["referral.milestones"].map((m) => m.lotId),
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
  const draft = draftOf(RANKED_FORM_KEYS, rankedSettingsSchema, input);
  // Limité avant la vérification des lots en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  // Chaque lot de fin de saison doit exister : sinon la réclamation échouerait chez les joueurs
  if (draft) {
    const lotIds = [...new Set(Object.values(draft["ranked.rewardLots"]).filter((id): id is string => id !== null))];
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
  const draft = draftOf(NEWS_SETTING_KEYS, newsSettingsSchema, input);
  const foreign = draft?.["home.news"].items.some((i) => i.visual.kind === "image" && !validNewsImageUrl(i.visual.url, process.env.BLOB_PUBLIC_HOST));
  if (foreign) return { ok: false, error: "INVALID" };
  return saveSettings(NEWS_SETTING_KEYS, newsSettingsSchema, input, {
    finalize: (next, before) => ({
      "home.news": nextPublication(before["home.news"], next["home.news"], reopen === true, new Date()),
    }),
  });
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

/** Casino : ouverture, garde-fous et règles du pile ou face (raretés jouables vérifiées contre le registre). */
export async function updateCasinoSettings(input: unknown): Promise<UpdateSettingsResult<CasinoFormKey>> {
  return saveSettings(CASINO_FORM_KEYS, casinoSettingsSchema, input);
}

/** Import Kyara (/admin/kyara) : toute l'équipe (ADMIN et DEV) le règle, comme elle traite la file (lib/admin/roles.ts). */
async function kyaraStaff() {
  const staff = await getStaff();
  return staff && canProcessKyaraImports(staff.user.role) ? staff.user : null;
}

export async function updateKyaraImportSettings(input: unknown): Promise<UpdateSettingsResult<KyaraFormKey>> {
  return saveSettings(KYARA_FORM_KEYS, kyaraSettingsSchema, input, { editor: kyaraStaff });
}

/** Parrainage v2 : toute l'équipe (ADMIN et DEV) le règle, interrupteur compris, comme elle tient la file (lib/admin/roles.ts). */
async function referralStaff() {
  const staff = await getStaff();
  return staff && canManageReferrals(staff.user.role) ? staff.user : null;
}

export async function updateReferralV2Settings(input: unknown): Promise<UpdateSettingsResult<ReferralV2FormKey>> {
  return saveSettings(REFERRAL_V2_FORM_KEYS, referralV2SettingsSchema, input, { editor: referralStaff });
}

/**
 * La fête ne s'allume pas avec un palier vide : il se figerait sans rien à donner et annoncerait quand même « ton lot
 * est arrivé ». Vérifié sur le brouillon (INVALID), puis sur ce qui sera en vigueur (STALE si un autre a vidé un palier).
 */
const ennichiTiersReady = (v: SettingsOf<EnnichiFormKey>) => !(v["ennichi.enabled"] && v["ennichi.tiers"].some((t) => !t.lotId && t.choiceVouchers === 0));

/** Ennichi : toute l'équipe aussi (canManageReferrals) ; les pages de la fête suivent tout de suite. */
export async function updateEnnichiSettings(input: unknown): Promise<UpdateSettingsResult<EnnichiFormKey>> {
  const staff = await referralStaff();
  if (!staff) return { ok: false, error: "FORBIDDEN" };
  const v = draftOf(ENNICHI_FORM_KEYS, ennichiSettingsSchema, input);
  if (v) {
    if (!(await rateLimit(`admin-check:${staff.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
    // Les lots cités doivent exister (sinon chaque versement échouerait)
    const lotIds = [...new Set([...v["ennichi.tiers"], ...v["ennichi.ranks"], ...v["ennichi.omikuji"]].flatMap((x) => (x.lotId ? [x.lotId] : [])))];
    if (lotIds.length > 0 && (await prisma.lot.count({ where: { id: { in: lotIds } } })) !== lotIds.length) return { ok: false, error: "INVALID" };
    if (!ennichiTiersReady(v)) return { ok: false, error: "INVALID" };
  }
  const result = await saveSettings(ENNICHI_FORM_KEYS, ennichiSettingsSchema, input, { editor: referralStaff, holds: ennichiTiersReady });
  if (result.ok && result.changed.length > 0) {
    forgetEnnichiView();
    updateTag(ENNICHI_TAG);
  }
  return result;
}

export async function updateEventGaugeSettings(input: unknown): Promise<UpdateSettingsResult<EventGaugeSettingKey>> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const draft = draftOf(EVENT_GAUGE_SETTING_KEYS, eventGaugeSettingsSchema, input);
  // Limité avant la vérification du lot en base (bucket à part de celui de l'écriture)
  if (!(await rateLimit(`admin-check:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  // La récompense promise doit exister : sinon la jauge afficherait un lot introuvable
  const lotId = draft ? draft["home.eventGauge.rewardLotId"] : null;
  if (lotId && !(await prisma.lot.findUnique({ where: { id: lotId }, select: { id: true } }))) return { ok: false, error: "INVALID" };
  return saveSettings(EVENT_GAUGE_SETTING_KEYS, eventGaugeSettingsSchema, input);
}

/** Wrapped : interrupteur, année racontée et période d'ouverture. */
export async function updateWrappedSettings(input: unknown): Promise<UpdateSettingsResult<WrappedSettingKey>> {
  return saveSettings(WRAPPED_SETTING_KEYS, wrappedSettingsSchema, input);
}

export async function updateShowcaseEventSettings(input: unknown): Promise<UpdateSettingsResult<ShowcaseEventSettingKey>> {
  return saveSettings(SHOWCASE_EVENT_SETTING_KEYS, showcaseEventSettingsSchema, input);
}

/** Prestige : le schéma refuse un sceau de tirage hors de la police des sceaux. */
export async function updatePrestigeSettings(input: unknown): Promise<UpdateSettingsResult<PrestigeSettingKey>> {
  return saveSettings(PRESTIGE_SETTING_KEYS, prestigeSettingsSchema, input);
}

export async function updateExpeditionSettings(input: unknown): Promise<UpdateSettingsResult<ExpeditionSettingKey>> {
  return saveSettings(EXPEDITION_SETTING_KEYS, expeditionSettingsSchema, input);
}

export async function updateUsageSettings(input: unknown): Promise<UpdateSettingsResult<UsageSettingKey>> {
  return saveSettings(USAGE_SETTING_KEYS, usageSettingsSchema, input);
}
