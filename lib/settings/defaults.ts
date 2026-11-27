import { z } from "@/lib/zod";
import { rarityKeySchema } from "@/lib/catalog/definitions";
import { RARITIES, VARIANT_RARITIES } from "@/lib/catalog/rarity";
import { THEMES_DEFAULT, themesSettingSchema } from "@/lib/showcase/themes";
import { rotationPinSchema } from "@/lib/boosters/rotation";
import { slugSchema } from "@/lib/boosters/types";
import { KEYWORDS, LEGACY_KEYWORDS, TECHNIQUES, ULTIMATES } from "@/lib/battle/types";
import { JOIN_MODAL_DEFAULT, joinModalSchema } from "@/lib/discord/join-modal";
import { DETECTION_SCORING_DEFAULT, detectionScoringSchema } from "@/lib/anticheat/scoring";
import { SOCIAL_PROMO_DEFAULT, socialPromoSchema } from "@/lib/discord/social-promo";
import { NEWS_DEFAULT, newsSchema } from "@/lib/home/news-schema";
import { alertThresholdsSchema, DEFAULT_ALERT_THRESHOLDS } from "@/lib/usage/quota";
import { KYARA_PROFILE_INPUT_MAX, parseKyaraProfileUrl } from "@/lib/kyara/profile-url";
import { ACHIEVEMENTS, achievementByKey } from "@/lib/achievements/catalog";
import { MAX_OFFERS_PER_DAY } from "@/lib/expedition/types";

// Seuils de rareté en points de base (300 = top 3 %), du plus rare au plus courant
const rarityThresholds = z
  .object({
    mythic: z.number().int().min(1).max(10_000),
    legendary: z.number().int().min(1).max(10_000),
    epic: z.number().int().min(1).max(10_000),
    rare: z.number().int().min(1).max(10_000),
    uncommon: z.number().int().min(1).max(10_000),
  })
  .refine((t) => t.mythic < t.legendary && t.legendary < t.epic && t.epic < t.rare && t.rare < t.uncommon, {
    message: "Les seuils doivent être strictement croissants",
  });

const rarity = rarityKeySchema;

// Expéditions : points de chance qu'apporte une carte selon son écart de palier avec la rareté exigée
// (« same » = même palier). Trois paliers ou plus en dessous : rien.
const pct = z.number().int().min(0).max(100);
const expeditionCardBonus = z.object({ below2: pct, below1: pct, same: pct, above1: pct, above2: pct, above3: pct });

// Prestige (étape 16) : seuils d'accès par rareté (% des cartes publiées, 0 = rareté ignorée), barème dégressif
// des Zeni (tranches croissantes, au-delà de la dernière : rien), éditions gravées (chance en points de base,
// taille des tirages, sceau de chaque tirage) par clé de rareté ; une rareté absente n'est jamais gravée
const prestigePercent = z.record(rarityKeySchema, z.number().int().min(0).max(100));
const prestigeZeniTiers = z
  .array(z.object({ upTo: z.number().int().min(1).max(100_000_000), pct: z.number().int().min(0).max(100) }).strict())
  .min(1)
  .max(5)
  .refine((tiers) => tiers.every((t, i) => i === 0 || t.upTo > tiers[i - 1].upTo), { message: "Les tranches doivent être croissantes" });
const printingChance = z.record(rarityKeySchema, z.number().int().min(0).max(10_000));
const printingSizes = z.record(rarityKeySchema, z.number().int().min(1).max(10_000));
const printingSeals = z.record(z.string().regex(/^[1-9][0-9]{0,2}$/), z.string().min(1).max(4));

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Parts de tirage par rareté, en millièmes de % (entiers : aucun arrondi de flottant au tirage)
const rarityRates = z.record(rarityKeySchema, z.number().int().min(0).max(1_000_000))
  .refine((rates) => Object.values(rates).some((r) => r > 0), { message: "Au moins une rareté doit avoir une part" });
const recycleValues = z.record(rarityKeySchema, z.number().int().min(0).max(100_000));
const kyaraZeni = z.number().int().min(0).max(100_000);

const cardStats = z.object({
  powerMax: z.number().int().min(1).max(999),
  powerSpan: z.number().int().min(0).max(999),
  kiMin: z.number().int().min(0).max(999),
  kiSpan: z.number().int().min(0).max(999),
});

// Combat (étape 9) : PV = hpBase + ki × hpPerKiPct / 100
const battleStats = z.object({
  hpBase: z.number().int().min(1).max(9_999),
  hpPerKiPct: z.number().int().min(0).max(10_000),
});

// Critique en ‰, multiplicateurs et aléa en %
const battleDamage = z
  .object({
    critPermille: z.number().int().min(0).max(1_000),
    critPct: z.number().int().min(100).max(1_000),
    varianceMinPct: z.number().int().min(1).max(200),
    varianceMaxPct: z.number().int().min(1).max(200),
  })
  .refine((d) => d.varianceMinPct <= d.varianceMaxPct, { message: "Aléa minimum au-dessus du maximum" });

const battleOrbs = z.object({
  start: z.number().int().min(0).max(20),
  perTurn: z.number().int().min(0).max(20),
  max: z.number().int().min(1).max(20),
  secondBonus: z.number().int().min(0).max(20),
});

const battleKeywordValues = z.object({
  poisonPct: z.number().int().min(0).max(100),
  poisonTurns: z.number().int().min(0).max(10),
  ripostePct: z.number().int().min(0).max(200),
  lastWillHealPct: z.number().int().min(0).max(100),
  revivePct: z.number().int().min(1).max(100),
  lifestealPct: z.number().int().min(0).max(100),
  ragePct: z.number().int().min(0).max(200),
  rageThresholdPct: z.number().int().min(1).max(100),
  armorPct: z.number().int().min(0).max(90),
  executePct: z.number().int().min(0).max(200),
  executeThresholdPct: z.number().int().min(1).max(100),
  channelOrbs: z.number().int().min(0).max(5),
});

const battleTechniques = z.object(
  Object.fromEntries(
    TECHNIQUES.map((t) => [t, z.object({ cost: z.number().int().min(0).max(20), value: z.number().int().min(0).max(1_000) })]),
  ) as { [T in (typeof TECHNIQUES)[number]]: z.ZodObject<{ cost: z.ZodNumber; value: z.ZodNumber }> },
);

// Prix de l'atelier en Zeni, par capacité ; complétés avec les défauts à la lecture (completed)
const abilityPrice = z.number().int().min(1).max(1_000_000);
const battleAbilityPrices = z.object({
  keywords: z.object(Object.fromEntries(KEYWORDS.map((k) => [k, abilityPrice])) as { [K in (typeof KEYWORDS)[number]]: typeof abilityPrice }),
  techniques: z.object(Object.fromEntries(TECHNIQUES.map((t) => [t, abilityPrice])) as { [T in (typeof TECHNIQUES)[number]]: typeof abilityPrice }),
});

// Ultis : points de jauge par action et pour la perte de tous ses PV (au prorata), sur 100
const battleUltimateCharge = z.object({
  perAction: z.number().int().min(0).max(100),
  damagePct: z.number().int().min(0).max(400),
});
// Valeur de chaque ulti : multiplicateur en % (Châtiment céleste, Tempête de pétales), PV rendus en % (Résurrection)
const battleUltimates = z.object(
  Object.fromEntries(ULTIMATES.map((u) => [u, z.number().int().min(0).max(1_000)])) as { [U in (typeof ULTIMATES)[number]]: z.ZodNumber },
);

// Le nombre de passifs d'une carte vient du tirage historique, sur les passifs d'origine
const keywordsByRarity = z.record(rarityKeySchema, z.number().int().min(0).max(LEGACY_KEYWORDS.length));

// Zeni versés au gagnant selon le mode, et nombre de combats récompensés par jour
const battleRewards = z.object({
  exhibition: z.number().int().min(0).max(100_000),
  bot: z.number().int().min(0).max(100_000),
  friend: z.number().int().min(0).max(100_000),
  ranked: z.number().int().min(0).max(100_000),
  dailyCap: z.number().int().min(0).max(1_000),
});

// Classé (étape 9b) : barème d'un rang, PC minimum compris
const tierRow = z.object({
  min: z.number().int().min(0).max(100_000),
  win: z.number().int().min(0).max(1_000),
  crushWin: z.number().int().min(0).max(1_000),
  loss: z.number().int().min(0).max(1_000),
  crushLoss: z.number().int().min(0).max(1_000),
});
const LADDER_KEYS = ["BRONZE", "SILVER", "GOLD", "EMERALD", "ELITE", "CHAMPION"] as const;
const rankedTiers = z
  .object(Object.fromEntries(LADDER_KEYS.map((k) => [k, tierRow])) as { [K in (typeof LADDER_KEYS)[number]]: typeof tierRow })
  .refine((t) => t.BRONZE.min === 0 && LADDER_KEYS.every((k, i) => i === 0 || t[k].min > t[LADDER_KEYS[i - 1]].min), {
    message: "Les rangs doivent commencer à 0 PC et monter strictement",
  });

// Id d'un Lot (cuid), ou null
const lotId = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const lotRef = lotId.nullable();

// Paliers de parrainage : un lot par nombre d'amis qualifiés, seuils strictement croissants
export const MAX_REFERRAL_MILESTONES = 8;
const referralMilestones = z
  .array(z.object({ referrals: z.number().int().min(1).max(1_000), lotId }))
  .max(MAX_REFERRAL_MILESTONES)
  .refine((ms) => ms.every((m, i) => i === 0 || m.referrals > ms[i - 1].referrals), {
    message: "Les paliers doivent monter strictement",
  });

// Parrainage v2 (étape 18) : lot de chaque étape du filleul, des deux côtés, et part « confiance » du parrain (les
// boosters Mythiques des étapes 1 et 2, versés à l'étape 3 quand le filleul n'a pas de Discord ancien)
const referralV2StepLots = z
  .array(z.object({ referee: lotRef, referrer: lotRef, referrerTrust: lotRef }).strict())
  .length(4)
  .refine((steps) => steps.slice(2).every((s) => s.referrerTrust === null), {
    message: "La part « confiance » ne concerne que les étapes 1 et 2",
  });

// Paliers du parrain v2, en amis installés : lot, bons « Mythique au choix », carte 1/1, rôle Ambassadeur proposé à
// l'équipe, nom au mur des légendes. Les badges et le cadre se débloquent par leurs conditions de profil.
export const MAX_REFERRAL_V2_MILESTONES = 12;
const referralV2Milestones = z
  .array(
    z
      .object({
        installed: z.number().int().min(1).max(10_000),
        lotId: lotRef,
        choiceVouchers: z.number().int().min(0).max(20),
        oneOfOne: z.boolean(),
        ambassador: z.boolean(),
        legend: z.boolean(),
      })
      .strict(),
  )
  .max(MAX_REFERRAL_V2_MILESTONES)
  .refine((ms) => ms.every((m, i) => i === 0 || m.installed > ms[i - 1].installed), {
    message: "Les paliers doivent monter strictement",
  });

// Ennichi (étape 18d) : paliers de lanternes (exactement 4, seuils qui montent, lot pour chaque joueur éligible et bons
// « Mythique au choix »), rangs du banzuke (titre sumo, lot, bons, carte 1/1) et cagnotte de l'omikuji, du plus rare au
// moins rare (chaque ticket gagne au plus un lot, dans cet ordre).
export const ENNICHI_TITLES = ["yokozuna", "ozeki", "sekiwake"] as const;
const ennichiTiers = z
  .array(z.object({ lanterns: z.number().int().min(1).max(1_000_000), lotId: lotRef, choiceVouchers: z.number().int().min(0).max(20) }).strict())
  .length(4)
  .refine((ts) => ts.every((t, i) => i === 0 || t.lanterns > ts[i - 1].lanterns), { message: "Les seuils doivent monter strictement" });
const ennichiRanks = z
  .array(
    z
      .object({
        from: z.number().int().min(1).max(10_000),
        to: z.number().int().min(1).max(10_000),
        title: z.enum(ENNICHI_TITLES).nullable(),
        lotId: lotRef,
        choiceVouchers: z.number().int().min(0).max(20),
        oneOfOne: z.boolean(),
      })
      .strict(),
  )
  .max(12)
  .refine((rs) => rs.every((r, i) => r.from <= r.to && (i === 0 ? r.from === 1 : r.from === rs[i - 1].to + 1)), {
    message: "Les rangs se suivent sans trou, à partir du 1er",
  });
const ennichiOmikuji = z
  .array(z.object({ lotId: lotRef, oneOfOne: z.boolean(), count: z.number().int().min(0).max(10_000) }).strict())
  .max(8)
  // Une ligne est une carte 1/1 ou un lot ; sans lot posé (seed absent), elle ne part pas
  .refine((ps) => ps.every((p) => !(p.oneOfOne && p.lotId !== null)), { message: "Une ligne de carte 1/1 n'a pas de lot" });

// Lot de fin de saison par meilleur rang atteint
const rankedRewardLots = z.object(
  Object.fromEntries([...LADDER_KEYS, "GRAND_CHAMPION"].map((k) => [k, lotRef])) as {
    [K in (typeof LADDER_KEYS)[number] | "GRAND_CHAMPION"]: typeof lotRef;
  },
);

// Succès : seuils réglés (clé du catalogue → seuil) et succès désactivés. Une clé retirée du catalogue est
// ignorée à la lecture au lieu d'invalider tout le réglage (qui retomberait sur les défauts).
const achievementGoals = z.preprocess(
  (raw) => (isRecord(raw) ? Object.fromEntries(Object.entries(raw).filter(([key]) => achievementByKey(key) !== undefined)) : raw),
  z.record(z.string(), z.number().int().min(1).max(100_000_000)),
);
const achievementDisabled = z.preprocess(
  (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((key) => typeof key === "string" && achievementByKey(key) !== undefined))] : raw),
  z.array(z.string()).max(ACHIEVEMENTS.length),
);

// Réglages de jeu modifiables depuis /admin (table GameSetting).
// Le code ne garde que les valeurs par défaut ; chaque clé a son schéma Zod.
export const SETTING_SCHEMAS = {
  "economy.startingZeni": z.number().int().min(0).max(1_000_000),
  "booster.maxStock": z.number().int().min(1).max(100),
  "booster.intervalMinutes": z.number().int().min(1).max(24 * 60),
  "booster.rates": rarityRates,
  // Rareté minimale de chaque emplacement ; la longueur donne le nombre de cartes par booster
  "booster.slotFloors": z.array(rarity).min(1).max(10),
  "booster.pityThreshold": z.number().int().min(1).max(10_000),
  // Booster doré : tous les N boosters gratuits (0 = désactivé), dernier emplacement relevé à goldenFloor
  "booster.goldenEvery": z.number().int().min(0).max(1_000),
  "booster.goldenFloor": rarity,
  // Sachets scellés : un booster gratuit se transforme en sachet Divin (1 chance sur N) ou
  // Apocalyptique (1 chance sur M) ; 0 = désactivé
  "booster.divineOdds": z.number().int().min(0).max(1_000_000),
  "booster.apocalypseOdds": z.number().int().min(0).max(1_000_000),
  // Apocalyptique : part épargnée en points de base, karma (ruinés d'affilée avant une épargne forcée, 0 = aucun)
  "booster.apocalypseWinRate": z.number().int().min(0).max(10_000),
  "booster.apocalypseKarma": z.number().int().min(0).max(20),
  // Apocalyptique ruiné : planchers de chaque emplacement et rareté maximale
  "booster.apocalypseRuinFloors": z.array(rarity).min(1).max(10),
  "booster.apocalypseRuinCeiling": rarity,
  // Doublons des grandes raretés : une carte de ces raretés déjà possédée n'a plus qu'une chance sur
  // Divisor de ses chances normales, et plus aucune à partir de BlockAt exemplaires (0 = jamais bloquée)
  "booster.duplicateGuardRarities": z
    .array(rarity)
    .max(20)
    .refine((list) => new Set(list).size === list.length, { message: "Rareté en double" }),
  "booster.duplicateGuardDivisor": z.number().int().min(1).max(1_000_000),
  "booster.duplicateGuardBlockAt": z.number().int().min(0).max(10),
  // Taille minimale du pool d'un type de booster pour être proposé (un type peut l'abaisser)
  "booster.minPool": z.number().int().min(1).max(10_000),
  // Rotation des familles « Par démographie » et « Par genre » : durée d'une sélection et nombre de types proposés
  "booster.rotationHours": z.number().int().min(1).max(24 * 7),
  "booster.rotationDemographie": z.number().int().min(0).max(50),
  "booster.rotationGenre": z.number().int().min(0).max(50),
  // Sélection épinglée par l'admin pour la fenêtre en cours (null = hasard)
  "booster.rotationPin": rotationPinSchema.nullable(),
  // Encens : un par palier de cartes tirées en boosters, boost des taux à partir de boostFrom
  // (points de base, 10 000 = ×1) pendant durationHours, sur tous les boosters
  "incense.cardStep": z.number().int().min(1).max(1_000_000),
  "incense.durationHours": z.number().int().min(1).max(24 * 7),
  "incense.rateBoost": z.number().int().min(10_000).max(100_000),
  "incense.boostFrom": rarity,
  // Fuseau du jeu : « aujourd'hui » (anniversaires) et saison AniList en cours
  "game.timeZone": z.string().min(1).max(64).refine(isTimeZone, { message: "Fuseau horaire inconnu" }),
  "collection.recycleValues": recycleValues,
  // Vitrines du profil : nombre par joueur, statut et condition de déblocage de chaque thème
  "showcase.maxPerPlayer": z.number().int().min(1).max(20),
  "showcase.themes": themesSettingSchema,
  // Event vitrines (/event) : visible ou caché, édition (inscriptions et votes rangés par édition), fenêtre
  // où l'on s'inscrit et vote, minimum de cartes de la vitrine engagée, vitrines par page de la galerie
  "event.showcase.enabled": z.boolean(),
  "event.showcase.edition": z.string().regex(/^[a-z0-9-]{1,40}$/),
  "event.showcase.startsAt": z.string().datetime(),
  "event.showcase.endsAt": z.string().datetime(),
  "event.showcase.minCards": z.number().int().min(1).max(20),
  "event.showcase.pageSize": z.number().int().min(4).max(30),
  // Ancienneté minimale (heures depuis l'inscription) pour voter : barrière anti-multicomptes, comme le Marché et les cadeaux
  "event.showcase.voteMinAccountAgeHours": z.number().int().min(0).max(24 * 365),
  // Expéditions (/expedition, étape 14) : cachées tant que l'admin ne les allume pas (aperçu pour l'admin).
  // Offres par jour et par joueur, attente après un abandon, bonus de chance de chaque carte selon son écart
  // de palier avec la rareté exigée, gains du triomphe et consolation d'un échec (en % des gains de réussite)
  "expedition.enabled": z.boolean(),
  "expedition.offersPerDay": z.number().int().min(1).max(MAX_OFFERS_PER_DAY),
  "expedition.abandonCooldownHours": z.number().int().min(0).max(72),
  "expedition.cardBonus": expeditionCardBonus,
  "expedition.triumphRewardPct": z.number().int().min(100).max(500),
  "expedition.failRewardPct": z.number().int().min(0).max(100),
  // Social (étape 6) : interrupteurs, limites anti-spam et anti-farm des cadeaux
  "social.enabled": z.boolean(),
  "friends.max": z.number().int().min(1).max(5_000),
  "friends.maxOutgoingPending": z.number().int().min(1).max(500),
  // Délai avant de pouvoir redemander après un refus ou une annulation
  "friends.requestCooldownHours": z.number().int().min(0).max(24 * 90),
  // Recherche de joueurs de la page Social : résultats au plus, recherches par minute (joueur, IP)
  "social.searchLimit": z.number().int().min(1).max(50),
  "social.searchPerMinute": z.number().int().min(1).max(600),
  "social.searchPerMinuteIp": z.number().int().min(1).max(2_000),
  "gifts.enabled": z.boolean(),
  "gifts.perDaySent": z.number().int().min(0).max(100),
  "gifts.perDayReceived": z.number().int().min(0).max(100),
  "gifts.minAccountAgeHours": z.number().int().min(0).max(24 * 365),
  "gifts.minFriendshipHours": z.number().int().min(0).max(24 * 365),
  "gifts.boosterPriceZeni": z.number().int().min(1).max(1_000_000),
  "gifts.allowedRarities": z.array(rarity).max(200),
  // Sachets scellés offerts : compte lié à Discord, ancienneté, au plus sealedPerWindow sachets sur les
  // sealedWindowDays derniers jours (fenêtre glissante)
  "gifts.sealedRequiresDiscord": z.boolean(),
  "gifts.sealedMinAccountDays": z.number().int().min(0).max(365),
  "gifts.sealedPerWindow": z.number().int().min(0).max(50),
  "gifts.sealedWindowDays": z.number().int().min(1).max(30),
  // Échanges entre amis (étape 12f) : rien n'est bloqué pendant l'attente, tout est revérifié à l'acceptation
  "trades.enabled": z.boolean(),
  "trades.nonFriends": z.boolean(),
  "trades.expiryHours": z.number().int().min(1).max(24 * 30),
  "trades.maxOffered": z.number().int().min(1).max(10),
  "trades.maxPendingSent": z.number().int().min(1).max(100),
  "trades.perDay": z.number().int().min(1).max(500),
  "trades.allowedRarities": z.array(rarity).max(200),
  // Chat entre amis (étape 12g)
  "chat.enabled": z.boolean(),
  "chat.maxLength": z.number().int().min(20).max(500),
  "chat.perMinute": z.number().int().min(1).max(120),
  // Durée de vie d'un message, comme une discussion éphémère : supprimé passé ce délai
  "chat.retentionHours": z.number().int().min(1).max(24 * 365),
  "chat.pollSeconds": z.number().int().min(3).max(300),
  // Profil (étape 12h) : badge Pionnier (inscrits jusqu'à cette date, AAAA-MM-JJ, ou aucun) et Parrain
  "profile.pioneerUntil": z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  "profile.sponsorReferrals": z.number().int().min(0).max(1_000),
  // Badge Recruteur : à partir de ce nombre de filleuls qualifiés (0 = jamais)
  "profile.recruiterReferrals": z.number().int().min(0).max(1_000),
  // Succès (honorifiques) : interrupteur, seuils réglés dans l'admin et succès désactivés (lib/achievements/catalog.ts)
  "achievements.enabled": z.boolean(),
  "achievements.goals": achievementGoals,
  "achievements.disabled": achievementDisabled,
  // Rôle Ambassadeur (donné par l'admin) : stock de boosters gratuits et pack hebdomadaire (0 = aucun pack)
  "ambassador.maxStock": z.number().int().min(1).max(100),
  "ambassador.weeklyBoosters": z.number().int().min(0).max(50),
  "ambassador.weeklyBoosterSlug": slugSchema,
  "notifications.retentionDays": z.number().int().min(1).max(365),
  // Intervalle de sondage de la cloche et des toasts (onglet visible seulement)
  "notifications.pollSeconds": z.number().int().min(10).max(600),
  // Tâches de fond (enchères échues, combats expirés, échanges) lancées au plus une fois par joueur et par délai
  "notifications.sweepSeconds": z.number().int().min(30).max(3_600),
  // Temps réel (Ably) : sondage de secours de la cloche et du chat quand la connexion est ouverte
  "realtime.safetyPollSeconds": z.number().int().min(30).max(1_800),
  // Inactivité : plus aucun sondage passé ce délai sans geste du joueur ; reprise au premier geste
  "activity.idleSeconds": z.number().int().min(30).max(3_600),
  // Sondage sans changement : le délai double à chaque fois, jusqu'à ce multiple du délai de base
  "activity.backoffMax": z.number().int().min(1).max(16),
  // Présence : battement tant que le joueur est là, et délai sous lequel il compte comme en ligne
  "presence.heartbeatSeconds": z.number().int().min(30).max(600),
  "presence.onlineSeconds": z.number().int().min(60).max(3_600),
  // Web Push (onglet fermé) : interrupteur global, l'abonnement reste un choix du joueur
  "notifications.pushEnabled": z.boolean(),
  // Économie (étape 7) : interrupteurs, parrainage et paiement par carte (inerte sans fournisseur)
  "missions.enabled": z.boolean(),
  "shop.enabled": z.boolean(),
  "shop.premiumEnabled": z.boolean(),
  "referral.enabled": z.boolean(),
  "referral.attachWindowDays": z.number().int().min(0).max(365),
  "referral.maxPerMonth": z.number().int().min(0).max(1_000),
  "referral.minAccountAgeHours": z.number().int().min(0).max(24 * 365),
  "referral.minBoostersOpened": z.number().int().min(0).max(10_000),
  "referral.requireVerified": z.boolean(),
  // Lots versés à la qualification ; null = pas de récompense de ce côté
  "referral.referrerLotId": lotRef,
  "referral.refereeLotId": lotRef,
  // Paliers : lot réclamable une fois atteint ce nombre d'amis qualifiés, sans limite de temps
  "referral.milestones": referralMilestones,
  // Parrainage v2 (étape 18), coupé par défaut : tant qu'il l'est, la v1 ci-dessus tourne sans changement.
  // Étapes du filleul comptées depuis son rattachement ; jours dans le fuseau game.timeZone, jour du rattachement compris
  "referral.v2.enabled": z.boolean(),
  "referral.v2.maxPerMonth": z.number().int().min(0).max(1_000),
  "referral.v2.installHours": z.number().int().min(0).max(24 * 30),
  "referral.v2.installOpenings": z.number().int().min(1).max(10_000),
  "referral.v2.guestGraceHours": z.number().int().min(0).max(48),
  "referral.v2.accroDays": z.number().int().min(1).max(90),
  "referral.v2.accroWindowDays": z.number().int().min(1).max(90),
  "referral.v2.fideleDays": z.number().int().min(1).max(180),
  "referral.v2.fideleWindowDays": z.number().int().min(1).max(180),
  "referral.v2.stepLots": referralV2StepLots,
  "referral.v2.grandLotId": lotRef,
  "referral.v2.milestones": referralV2Milestones,
  // Contrôles : confiance (âge du compte Discord à sa liaison), file « À vérifier » au-dessus du score de la paire,
  // durée de validité d'un score, verrous de transfert
  "referral.v2.trustDiscordDays": z.number().int().min(0).max(3_650),
  "referral.v2.holdScore": z.number().int().min(1).max(1_000),
  "referral.v2.scoreTtlHours": z.number().int().min(1).max(24 * 30),
  "referral.v2.cardLockDays": z.number().int().min(0).max(365),
  "referral.v2.pairLockDays": z.number().int().min(0).max(365),
  // Annonce « Le parrainage change » (lib/welcome/release.ts) : une fois, aux comptes créés avant cette date, pendant
  // announceDays jours ; vide = pas d'annonce
  "referral.v2.announceAt": z.string().datetime().nullable(),
  "referral.v2.announceDays": z.number().int().min(0).max(60),
  // Ennichi 縁日 (étape 18d), coupé par défaut : début choisi dans l'admin, puis `days` jours de fête et `closingDays`
  // jours de clôture avant le tirage. L'édition marque les filleuls arrivés pendant la fête, les titres et les résultats.
  "ennichi.enabled": z.boolean(),
  "ennichi.edition": z.number().int().min(1).max(1_000),
  "ennichi.startsAt": z.string().datetime().nullable(),
  "ennichi.days": z.number().int().min(1).max(60),
  "ennichi.closingDays": z.number().int().min(0).max(14),
  // Étapes 1 et 2 d'un ami arrivé pendant la fête, des deux côtés ; plafond mensuel des parrains levé pendant la fête
  "ennichi.stepMultiplier": z.number().int().min(1).max(10),
  "ennichi.liftCap": z.boolean(),
  "ennichi.tiers": ennichiTiers,
  "ennichi.ranks": ennichiRanks,
  "ennichi.omikuji": ennichiOmikuji,
  // Lots des lanternes : au plus ce nombre de comptes servis par IP vue pendant la fête (multicomptes)
  "ennichi.tierGrantsPerIp": z.number().int().min(1).max(100),
  // Comptes de l'équipe (ADMIN, DEV) écartés du banzuke et de l'omikuji (ils gardent les lots des lanternes)
  "ennichi.excludeStaff": z.boolean(),
  // Hôtel des ventes (étape 8) ; taux en points de base (500 = 5 %)
  "market.enabled": z.boolean(),
  "market.feeBp": z.number().int().min(0).max(5_000),
  "market.minIncrementBp": z.number().int().min(0).max(10_000),
  "market.antiSnipeSeconds": z.number().int().min(0).max(3_600),
  "market.extendSeconds": z.number().int().min(0).max(3_600),
  "market.durationsHours": z
    .array(z.number().int().min(1).max(24 * 14))
    .min(1)
    .max(8)
    .refine((d) => new Set(d).size === d.length, { message: "Durées en double" }),
  "market.maxActivePerSeller": z.number().int().min(1).max(1_000),
  "market.minAccountAgeHours": z.number().int().min(0).max(24 * 365),
  "market.minStartPrice": z.number().int().min(1).max(1_000_000),
  "market.maxPrice": z.number().int().min(1).max(100_000_000),
  // Plafond de prix par rareté (départ, achat immédiat et mises) ; rareté absente = plafond global seul
  "market.maxPriceByRarity": z.record(rarityKeySchema, z.number().int().min(1).max(100_000_000)),
  "market.pollSeconds": z.number().int().min(2).max(120),
  // Cote des cartes (lib/market/quotes.ts) : médiane des ventes de la fenêtre, à partir de quoteMinSales ventes
  "market.quoteWindowDays": z.number().int().min(7).max(180),
  "market.quoteMinSales": z.number().int().min(1).max(50),
  // Une voix par joueur qui fixe le prix, et ce nombre de joueurs différents au moins
  "market.quoteMinSellers": z.number().int().min(1).max(20),
  // Cote d'une carte plafonnée à ce multiple de la référence de sa rareté (0 : sans plafond)
  "market.quoteCapMultiplier": z.number().int().min(0).max(100),
  "market.quoteHistoryDays": z.number().int().min(30).max(365),
  // Avis de recherche (lib/market/buy-orders.ts) : prix bloqué jusqu'à la vente, l'annulation ou l'expiration
  "market.ordersEnabled": z.boolean(),
  "market.orderDurationDays": z.number().int().min(1).max(30),
  "market.maxOpenOrders": z.number().int().min(1).max(100),
  // Alertes aux détenteurs qu'un même acheteur peut déclencher sur 24 h glissantes (0 : sans plafond)
  "market.orderAlertsPerDay": z.number().int().min(0).max(10_000),
  // Carte sans cote : n'alerter que si l'avis dépasse la référence de sa rareté (et personne sans référence)
  "market.orderAlertRarityRef": z.boolean(),
  // Échanges ouverts du Marché : annonces « celle-ci contre l'une de celles-là », offres acceptées ou refusées
  "listings.enabled": z.boolean(),
  "listings.expiryHours": z.number().int().min(1).max(24 * 30),
  "listings.maxWants": z.number().int().min(1).max(10),
  "listings.maxActive": z.number().int().min(1).max(100),
  "listings.perDay": z.number().int().min(1).max(500),
  "listings.maxPendingOffers": z.number().int().min(1).max(200),
  // Offrir une carte hors de la liste demandée (« Proposer autre chose »)
  "listings.allowOther": z.boolean(),
  "listings.allowedRarities": z.array(rarity).max(200),
  // Combat 1v1 en direct (étape 9)
  "battle.enabled": z.boolean(),
  "battle.stats": battleStats,
  "battle.damage": battleDamage,
  "battle.orbs": battleOrbs,
  // Actions du premier joueur à son tout premier tour (compense l'avantage de commencer)
  "battle.firstTurnActions": z.number().int().min(0).max(6),
  "battle.keywordsByRarity": keywordsByRarity,
  "battle.keywordValues": battleKeywordValues,
  "battle.techniques": battleTechniques,
  // Durée d'un tour ; au-delà de maxMissedTurns tours expirés d'affilée, forfait
  "battle.turnSeconds": z.number().int().min(10).max(300),
  "battle.maxMissedTurns": z.number().int().min(1).max(10),
  // Tours globaux (chaque camp en joue la moitié) ; ensuite, le plus fort % de PV gagne
  "battle.maxTurns": z.number().int().min(2).max(200),
  // Attente en file avant de proposer un bot ; durée de vie d'un code ami
  "battle.queueSeconds": z.number().int().min(5).max(300),
  "battle.roomMinutes": z.number().int().min(1).max(24 * 60),
  // Bot : part de coups au hasard, chance qu'une de ses cartes monte d'une rareté
  "battle.botMistakePct": z.number().int().min(0).max(100),
  "battle.botUpgradePct": z.number().int().min(0).max(100),
  // Marge ajoutée au tour du joueur par coup du bot (animé sur son temps), au plus la durée d'un tour ; 0 : aucune
  "battle.botTurnGraceMs": z.number().int().min(0).max(10_000),
  "battle.rewards": battleRewards,
  // Anti-farm : un abandon ou un minuteur avant ce tour ne rapporte ni Zeni ni PC au gagnant (1 : sans anti-farm)
  "battle.rewardMinTurns": z.number().int().min(1).max(50),
  // Sondage de secours du plateau quand le temps réel (Ably) n'est pas configuré
  "battle.pollSeconds": z.number().int().min(1).max(30),
  // Resynchronisation de secours du plateau quand le temps réel est actif
  "battle.safetyPollSeconds": z.number().int().min(5).max(300),
  // Sondage de la file d'attente et du salon d'un code ami (complété par le temps réel)
  "battle.queuePollSeconds": z.number().int().min(2).max(60),
  "battle.lobbyPollSeconds": z.number().int().min(2).max(120),
  // Decks enregistrés par joueur : baisser la limite bloque les créations sans supprimer les decks existants
  "battle.maxDecks": z.number().int().min(1).max(50),
  // Bonus d'ATQ (%) d'une équipe de 3 cartes du même univers, jusqu'à la première mort du camp. 0 coupe la synergie.
  "battle.synergyAtkPct": z.number().int().min(0).max(100),
  // Chances qu'un emplacement de capacité reçoive une nouveauté. 0 : aucune carte ne change, les nouveautés ne s'obtiendront qu'au shop
  "battle.newAbilityPct": z.number().int().min(0).max(100),
  // Atelier (/combat/atelier) : achat de passifs et de techniques par personnage. Fermé, les kits déjà choisis restent en jeu
  "battle.abilityShopEnabled": z.boolean(),
  "battle.abilityPrices": battleAbilityPrices,
  // Raretés dont les cartes ont un ulti (case « Ultime » de l'éditeur de rareté)
  "battle.ultimateRarities": z.array(rarity).max(200),
  "battle.ultimateCharge": battleUltimateCharge,
  "battle.ultimates": battleUltimates,
  // Classé (étape 9b)
  "ranked.enabled": z.boolean(),
  "ranked.tiers": rankedTiers,
  // Grand Champion : PC minimum, taille du top et barème
  "ranked.grandChampion": tierRow.extend({ top: z.number().int().min(1).max(10_000) }),
  // Écart de niveau : (PC adverse − PC) / gapDivisor, borné à ±gapCapPct %
  "ranked.gapDivisor": z.number().int().min(1).max(100_000),
  "ranked.gapCapPct": z.number().int().min(0).max(100),
  // Victoire écrasante : au moins crushHpPct % des PV restants (ou aucune carte perdue)
  "ranked.crushHpPct": z.number().int().min(1).max(100),
  "ranked.protectionGames": z.number().int().min(0).max(50),
  // Écart de PC accepté en file : base + perSecond × secondes d'attente, au plus max
  "ranked.matchRange": z.object({
    base: z.number().int().min(0).max(100_000),
    perSecond: z.number().int().min(0).max(1_000),
    max: z.number().int().min(0).max(100_000),
  }),
  // Part des PC gagnés ou perdus contre un bot
  "ranked.botPcPct": z.number().int().min(0).max(100),
  // Anti-farm : bot tout de suite en classé (sinon après battle.queueSeconds), PC gagnés contre le bot par jour de jeu
  // (0 : sans plafond), parties classées entre deux mêmes joueurs qui comptent sur 24 h glissantes (0 : sans limite ;
  // au-delà, la partie se joue sans PC pour personne)
  "ranked.botOnDemand": z.boolean(),
  "ranked.botDailyPcCap": z.number().int().min(0).max(100_000),
  "ranked.samePairDailyCap": z.number().int().min(0).max(1_000),
  // Un diviseur de 12 : les saisons découpent l'année civile (5 donnerait janvier, juin, novembre, puis janvier)
  "ranked.seasonMonths": z
    .number()
    .int()
    .min(1)
    .max(12)
    .refine((m) => 12 % m === 0, { message: "Diviseur de 12 : 1, 2, 3, 4, 6 ou 12" }),
  // Fin de saison : au-dessus du pivot, on garde keepPct % de l'excédent
  "ranked.reset": z.object({ pivot: z.number().int().min(0).max(100_000), keepPct: z.number().int().min(0).max(100) }),
  "ranked.rewardLots": rankedRewardLots,
  "guest.createPerHourPerIp": z.number().int().min(1).max(1_000),
  // Invités sans activité supprimés après ce nombre de jours (0 = jamais), par le cron des comptes
  "guest.retentionDays": z.number().int().min(0).max(365),
  // Multi-comptes (/admin/multi-comptes) : conservation des IP et appareils vus, fréquence du relevé de présence,
  // nombre de comptes au-delà duquel une IP est jugée publique (4G, école) et ne lie plus, score minimal d'un groupe
  "multiAccount.retentionDays": z.number().int().min(1).max(365),
  "multiAccount.seenThrottleMinutes": z.number().int().min(1).max(1_440),
  "multiAccount.sharedIpCap": z.number().int().min(2).max(100),
  "multiAccount.minScore": z.number().int().min(1).max(500),
  // Barème de la détection (poids des indices, seuils) : décide aussi des mises « À vérifier » du parrainage v2
  "multiAccount.scoring": detectionScoringSchema,
  // Bans réseau : un appareil banni revenu avec une nouvelle IP la fait bannir (si elle ne coupe pas d'autres
  // comptes actifs au-delà de autoBanMaxOthers), pour autoBanDays jours, et au plus autoBanPerDevice IP par appareil.
  // followDeviceIpv4 : le suivi prend aussi les IPv4 (une IPv4 d'opérateur mobile ou de box se partage souvent ;
  // un /64 IPv6 reste propre à une ligne).
  "multiAccount.followDevice": z.boolean(),
  "multiAccount.followDeviceIpv4": z.boolean(),
  "multiAccount.autoBanMaxOthers": z.number().int().min(0).max(5),
  "multiAccount.autoBanDays": z.number().int().min(1).max(365),
  "multiAccount.autoBanPerDevice": z.number().int().min(1).max(50),
  // Bans d'une IPv4 posés par l'admin (fiche joueur, groupe, « Révoquer et bannir ») : expiration en jours, 0 = définitif
  "multiAccount.ipv4BanDays": z.number().int().min(0).max(365),
  "discord.linkBonusZeni": z.number().int().min(0).max(100_000),
  // Modal « Rejoins notre Discord » : lien, textes fr/en, déclencheur et fréquence
  "discord.joinModal": joinModalSchema,
  "discord.marketEnabled": z.boolean(),
  "discord.rankedEnabled": z.boolean(),
  // Casino : ouverture postée à l'heure dite et relais des lancers dont le pot atteint casinoMinRarity
  "discord.casinoEnabled": z.boolean(),
  "discord.prestigeEnabled": z.boolean(),
  "discord.casinoMinRarity": rarityKeySchema,
  // Avatars Discord relus par le bot : intervalle par joueur (heures, 0 = jamais), joueurs actifs depuis
  // N jours seulement, et nombre de joueurs relus par passage du cron (une fois par minute)
  "discord.avatarSyncHours": z.number().int().min(0).max(720),
  "discord.avatarSyncActiveDays": z.number().int().min(1).max(365),
  "discord.avatarSyncBatch": z.number().int().min(1).max(50),
  // Section « Rejoins notre Discord » de la page Social : lien, textes fr/en, fenêtre d'affichage
  "discord.socialPromo": socialPromoSchema,
  // Casino visible (menu, tuile du Compte, /casino) ; éteint, il disparaît pour les joueurs
  "features.casino": z.boolean(),
  // Prestige (étape 16) : caché tant que l'admin ne l'allume pas
  "prestige.enabled": z.boolean(),
  // Prestige coupé : l'équipe (ADMIN, DEV) renaît et consacre pour de vrai (oui) ou ne voit que l'aperçu (non)
  "prestige.staffLiveWhenDisabled": z.boolean(),
  "prestige.requiredPercent": prestigePercent,
  "prestige.keepSlots": z.number().int().min(1).max(100),
  "prestige.minDaysBetween": z.number().int().min(0).max(365),
  "prestige.maxCopies": z.number().int().min(1_000).max(1_000_000),
  "prestige.heritageMax": z.number().int().min(1).max(5),
  "prestige.consecrateMinOwnCycles": z.number().int().min(0).max(5),
  "prestige.zeniTiers": prestigeZeniTiers,
  "prestige.zeniCap": z.number().int().min(0).max(100_000_000),
  "prestige.printing.minPrestige": z.number().int().min(1).max(100),
  "prestige.printing.chanceBp": printingChance,
  "prestige.printing.sizes": printingSizes,
  "prestige.printing.current": z.number().int().min(1).max(999),
  "prestige.printing.seals": printingSeals,
  "prestige.printing.recycleMultiplier": z.number().int().min(1).max(100),
  // Rite joué après la renaissance : bain d'encre (INK) ou cinématique de lumière (CINEMATIC)
  "prestige.riteStyle": z.enum(["INK", "CINEMATIC"]),
  // Boosters offerts à chaque renaissance (crédités, à ouvrir) : type et nombre (0 = aucun)
  "prestige.rebirthBoosterSlug": slugSchema,
  "prestige.rebirthBoosters": z.number().int().min(0).max(10),
  // Casino : ouverture (vide = teaser sans date ; future = compte à rebours ; passée = ouvert), badge « Nouveau »
  // et cérémonie pendant newBadgeDays jours après l'ouverture (0 = ni l'un ni l'autre)
  "casino.opensAt": z.string().datetime().nullable(),
  "casino.newBadgeDays": z.number().int().min(0).max(90),
  "casino.minAccountAgeHours": z.number().int().min(0).max(24 * 365),
  // Pile ou face : coupé, le jeu disparaît sans cacher le casino ; les tables ouvertes restent retirables
  "casino.coinflip.enabled": z.boolean(),
  "casino.coinflip.expiryHours": z.number().int().min(1).max(24 * 7),
  "casino.coinflip.maxOpenTables": z.number().int().min(1).max(20),
  // Lancers par jour (fuseau game.timeZone) : tables posées et tables relevées
  "casino.coinflip.dailyLimit": z.number().int().min(1).max(500),
  "casino.coinflip.allowedRarities": z.array(rarity).max(200),
  // Miser le dernier exemplaire d'une carte (toujours après un avertissement)
  "casino.coinflip.lastCopyAllowed": z.boolean(),
  "casino.coinflip.lobbyPollSeconds": z.number().int().min(5).max(120),
  "casino.coinflip.tablePollSeconds": z.number().int().min(2).max(60),
  // Fil « Derniers lancers » du hall ; feedBigFrom : pot mis en avant à partir de cette rareté (le relais Discord a
  // son propre seuil, discord.casinoMinRarity)
  "casino.coinflip.feedSize": z.number().int().min(4).max(50),
  "casino.coinflip.feedMaxAgeHours": z.number().int().min(1).max(24 * 30),
  "casino.coinflip.feedBigFrom": rarity,
  // Import Kyara (étape 17) : interrupteur ; date de sortie (vide = « Bientôt » ; les comptes déjà inscrits ont leur
  // fenêtre à partir de là) ; durée de la fenêtre ; profil Kyara du compte Kiraku que les joueurs ajoutent en ami ;
  // Zeni d'une carte convertie, par code de rareté Kyara, et plafond par import ; conservation de la photo d'une
  // collection lue
  "kyaraImport.enabled": z.boolean(),
  "kyaraImport.launchAt": z.string().datetime().nullable(),
  "kyaraImport.windowDays": z.number().int().min(1).max(90),
  "kyaraImport.staffProfileUrl": z
    .string()
    .max(KYARA_PROFILE_INPUT_MAX)
    .refine((v) => parseKyaraProfileUrl(v) !== null, { message: "Adresse de profil Kyara invalide" })
    .nullable(),
  "kyaraImport.zeniByRarity": z.object({ C: kyaraZeni, U: kyaraZeni, R: kyaraZeni, E: kyaraZeni, L: kyaraZeni, M: kyaraZeni }).strict(),
  "kyaraImport.zeniCap": z.number().int().min(0).max(10_000_000),
  "kyaraImport.retentionDays": z.number().int().min(7).max(365),
  // Plafonds du versement automatique (0 = sans plafond) : au-delà, la lecture attend l'équipe (motif LARGE) et seul
  // un autre membre que celui qui l'a reçue peut la verser
  "kyaraImport.autoMaxCards": z.number().int().min(0).max(100_000),
  "kyaraImport.autoMaxZeni": z.number().int().min(0).max(10_000_000),
  // Délai minimal entre deux relances d'une même demande (0 = aucun) ; durée de vie de la clé du favori (0 = sans fin)
  "kyaraImport.reminderCooldownHours": z.number().int().min(0).max(720),
  "kyaraImport.staffKeyDays": z.number().int().min(0).max(365),
  // Carrousel « En direct · Gros tirages » de l'accueil (étape 12c)
  "home.pullFeed.enabled": z.boolean(),
  "home.pullFeed.minRarity": rarityKeySchema,
  "home.pullFeed.size": z.number().int().min(4).max(50),
  "home.pullFeed.maxAgeHours": z.number().int().min(1).max(24 * 30),
  "home.pullFeed.refreshSeconds": z.number().int().min(5).max(600),
  // Durée de cache du fil, partagé par tous les joueurs
  "home.pullFeed.cacheSeconds": z.number().int().min(5).max(600),
  // Apparitions max d'un même joueur dans le carrousel : au-delà, ses plus anciens tirages en sortent
  "home.pullFeed.maxPerPlayer": z.number().int().min(1).max(50),
  // Jauge communautaire au-dessus de la vitrine : boosters ouverts par les inscrits, dans la fenêtre
  // Wrapped (récap de l'année, lib/wrapped) : livré éteint, allumé depuis /admin/wrapped
  "wrapped.enabled": z.boolean(),
  "wrapped.year": z.number().int().min(2025).max(2100),
  "wrapped.opensAt": z.string().datetime(),
  "wrapped.closesAt": z.string().datetime(),
  "home.eventGauge.enabled": z.boolean(),
  "home.eventGauge.startsAt": z.string().datetime(),
  "home.eventGauge.endsAt": z.string().datetime(),
  "home.eventGauge.goal": z.number().int().min(1).max(100_000_000),
  "home.eventGauge.refreshSeconds": z.number().int().min(5).max(600),
  // Durée de cache du compte, partagé par tous les joueurs
  "home.eventGauge.cacheSeconds": z.number().int().min(5).max(600),
  // Ce que la jauge compte : boosters ouverts, ou lancers de pile ou face joués (inauguration du casino)
  "home.eventGauge.metric": z.enum(["BOOSTERS", "COINFLIPS"]),
  // Lot promis à tous si l'objectif est atteint (affiché sous la jauge ; l'envoi se fait depuis /admin/lots)
  "home.eventGauge.rewardLotId": lotRef,
  // Encart « Nouveautés » en haut de l'accueil : textes fr/en, nouveautés et liens (/admin/nouveautes)
  "home.news": newsSchema,
  // Conformité (étape 10) : version des CGU que tout compte inscrit doit avoir acceptée
  "legal.termsRequiredVersion": z.number().int().min(1).max(10_000),
  // Suppression du compte : délai (annulable) avant l'anonymisation
  "account.deletionGraceDays": z.number().int().min(0).max(365),
  "account.usernameChangeDays": z.number().int().min(0).max(365),
  "account.exportsPerDay": z.number().int().min(1).max(50),
  "catalog.size": z.number().int().min(10).max(50_000),
  "catalog.rarityThresholds": rarityThresholds,
  // FROZEN : une carte garde la rareté de sa première apparition ; LIVE : elle suit son rang
  "catalog.rarityPolicy": z.enum(["FROZEN", "LIVE"]),
  "catalog.stats": cardStats,
  "catalog.minTagRank": z.number().int().min(0).max(100),
  // Badge « Nouveau » de la dernière sortie (/wiki/nouveautes), en heures après sa dernière publication ; 0 = jamais
  "catalog.newCardHours": z.number().int().min(0).max(720),
  "anilist.perPage": z.number().int().min(1).max(50),
  "anilist.requestDelayMs": z.number().int().min(500).max(60_000),
  // Seuils du bandeau de consommation du serveur (/admin/general), en % de la capacité
  "usage.alertThresholds": alertThresholdsSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;

/**
 * Réglages dont les clés (ou les valeurs) sont des raretés du registre, revérifiées à l'enregistrement ; "all" :
 * chaque rareté du registre doit y figurer.
 */
export const RARITY_KEYED: Partial<Record<SettingKey, "subset" | "all">> = {
  "booster.rates": "all",
  "collection.recycleValues": "all",
  "battle.keywordsByRarity": "all",
  "booster.slotFloors": "subset",
  "booster.goldenFloor": "subset",
  "gifts.allowedRarities": "subset",
  "trades.allowedRarities": "subset",
  "home.pullFeed.minRarity": "subset",
  "market.maxPriceByRarity": "subset",
  "booster.duplicateGuardRarities": "subset",
  "casino.coinflip.allowedRarities": "subset",
  "casino.coinflip.feedBigFrom": "subset",
  "discord.casinoMinRarity": "subset",
  "prestige.requiredPercent": "subset",
  "prestige.printing.chanceBp": "subset",
  "prestige.printing.sizes": "subset",
};
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  "economy.startingZeni": 500,
  "booster.maxStock": 10,
  "booster.intervalMinutes": 10,
  // Parts de Kyara (total 99 975) : 0,025 % · 0,15 % · 1,4 % · 11,4 % · 25 % · 62 %
  // AR et Gold (variantes au-dessus de Mythique) prennent 10 des 25 parts Mythique : « Mythique ou mieux »
  // reste à 0,025 %, et sans carte AR/Gold publiée le tirage retombe sur Mythique.
  "booster.rates": { COMMON: 62_000, UNCOMMON: 25_000, RARE: 11_400, EPIC: 1_400, LEGENDARY: 150, MYTHIC: 15, BR: 0, AR: 8, VR: 0, GOLD: 2, MR: 0, SR: 0, XR: 0 },
  "booster.slotFloors": ["COMMON", "COMMON", "UNCOMMON", "RARE"],
  "booster.pityThreshold": 250,
  "booster.goldenEvery": 10,
  "booster.goldenFloor": "EPIC",
  // Divin 1/4 000 + Apocalyptique 1/2 000 épargné à ~57 % (karma 2) : ~1,93 contenus divins pour
  // 4 000 boosters (un doré ne se transforme jamais), contre 2 avec l'ancien divin instantané à 1/2 000
  "booster.divineOdds": 4000,
  "booster.apocalypseOdds": 2000,
  "booster.apocalypseWinRate": 5000,
  "booster.apocalypseKarma": 2,
  "booster.apocalypseRuinFloors": ["COMMON", "COMMON", "COMMON", "UNCOMMON"],
  "booster.apocalypseRuinCeiling": "UNCOMMON",
  "booster.duplicateGuardRarities": ["MYTHIC", "BR", "AR", "VR", "GOLD", "MR", "SR", "XR"], // liste vide = règle coupée
  "booster.duplicateGuardDivisor": 10_000, // déjà possédée : 1 chance sur 10 000
  "booster.duplicateGuardBlockAt": 2, // en double : plus aucune chance
  "booster.minPool": 100,
  "booster.rotationHours": 12,
  "booster.rotationDemographie": 2,
  "booster.rotationGenre": 4,
  "booster.rotationPin": null,
  "incense.cardStep": 1500,
  "incense.durationHours": 6,
  "incense.rateBoost": 30_000,
  "incense.boostFrom": "LEGENDARY",
  "game.timeZone": "Europe/Paris",
  // Valeurs de Kyara : 1 · 1 · 3 · 10 · 40 · 150 Zeni
  "collection.recycleValues": { COMMON: 1, UNCOMMON: 1, RARE: 3, EPIC: 10, LEGENDARY: 40, MYTHIC: 150, BR: 150, AR: 450, VR: 450, GOLD: 1050, MR: 1050, SR: 1650, XR: 2250 },
  "showcase.maxPerPlayer": 6,
  "showcase.themes": THEMES_DEFAULT,
  "event.showcase.enabled": false, // caché tant que l'admin ne l'allume pas
  "event.showcase.edition": "vitrines-1",
  "event.showcase.startsAt": "2026-12-01T18:00:00.000Z", // 19h à Paris
  "event.showcase.endsAt": "2026-12-08T18:00:00.000Z", // 19h à Paris
  "event.showcase.minCards": 1,
  "event.showcase.pageSize": 10,
  "event.showcase.voteMinAccountAgeHours": 0, // 0 : tout compte inscrit vote dès son inscription
  "expedition.enabled": false, // caché tant que l'admin ne l'allume pas
  "expedition.offersPerDay": 3,
  "expedition.abandonCooldownHours": 3,
  "expedition.cardBonus": { below2: 2, below1: 4, same: 10, above1: 14, above2: 17, above3: 20 },
  "expedition.triumphRewardPct": 150,
  "expedition.failRewardPct": 25,
  "social.enabled": true,
  "friends.max": 200,
  "friends.maxOutgoingPending": 20,
  "friends.requestCooldownHours": 72,
  "social.searchLimit": 10,
  "social.searchPerMinute": 20,
  "social.searchPerMinuteIp": 60,
  "gifts.enabled": true,
  "gifts.perDaySent": 3,
  "gifts.perDayReceived": 5,
  "gifts.minAccountAgeHours": 48, // comme les enchères
  "gifts.minFriendshipHours": 24,
  "gifts.boosterPriceZeni": 200, // prix du booster standard
  "gifts.allowedRarities": [...RARITIES, ...VARIANT_RARITIES],
  "gifts.sealedRequiresDiscord": true,
  "gifts.sealedMinAccountDays": 7,
  "gifts.sealedPerWindow": 2, // 2 sachets scellés offerts…
  "gifts.sealedWindowDays": 3, // …tous les 3 jours par joueur
  "trades.enabled": true,
  "trades.nonFriends": true,
  "trades.expiryHours": 48,
  "trades.maxOffered": 5,
  "trades.maxPendingSent": 10,
  "trades.perDay": 20,
  "trades.allowedRarities": [...RARITIES, ...VARIANT_RARITIES],
  "chat.enabled": true,
  "chat.maxLength": 500,
  "chat.perMinute": 20,
  "chat.retentionHours": 24,
  "chat.pollSeconds": 10,
  "profile.pioneerUntil": "2026-12-31",
  "profile.sponsorReferrals": 3,
  "profile.recruiterReferrals": 10,
  "achievements.enabled": true,
  "achievements.goals": {}, // seuils du catalogue
  "achievements.disabled": [],
  "ambassador.maxStock": 15,
  "ambassador.weeklyBoosters": 5,
  "ambassador.weeklyBoosterSlug": "standard", // Tout anime
  "notifications.retentionDays": 30,
  "notifications.pollSeconds": 60,
  "notifications.sweepSeconds": 300,
  "realtime.safetyPollSeconds": 180,
  "activity.idleSeconds": 300,
  "activity.backoffMax": 4,
  "presence.heartbeatSeconds": 120,
  "presence.onlineSeconds": 300, // plus de deux battements : un battement manqué ne fait pas clignoter la pastille
  "notifications.pushEnabled": true,
  "missions.enabled": true,
  "shop.enabled": true,
  "shop.premiumEnabled": false, // jamais visible tant qu'aucun fournisseur de paiement n'est branché
  "referral.enabled": true,
  "referral.attachWindowDays": 7,
  "referral.maxPerMonth": 10,
  "referral.minAccountAgeHours": 48, // comme les cadeaux et les enchères
  "referral.minBoostersOpened": 20,
  "referral.requireVerified": true,
  "referral.referrerLotId": null,
  "referral.refereeLotId": null,
  "referral.milestones": [], // posés par le seed (prisma/seed/economy.ts), modifiables dans /admin/economie
  "referral.v2.enabled": false, // coupé tant que l'équipe ne l'allume pas
  "referral.v2.maxPerMonth": 30, // levé pendant l'Ennichi ; la v1 garde referral.maxPerMonth
  "referral.v2.installHours": 48,
  "referral.v2.installOpenings": 20,
  "referral.v2.guestGraceHours": 2, // le premier booster ouvert en invité, juste avant l'inscription, compte
  "referral.v2.accroDays": 5,
  "referral.v2.accroWindowDays": 14,
  "referral.v2.fideleDays": 15,
  "referral.v2.fideleWindowDays": 30,
  // Lots posés par le seed du parrainage v2 (lots à id fixe), réglables dans l'admin
  "referral.v2.stepLots": [
    { referee: null, referrer: null, referrerTrust: null },
    { referee: null, referrer: null, referrerTrust: null },
    { referee: null, referrer: null, referrerTrust: null },
    { referee: null, referrer: null, referrerTrust: null },
  ],
  "referral.v2.grandLotId": null,
  "referral.v2.milestones": [
    { installed: 1, lotId: null, choiceVouchers: 0, oneOfOne: false, ambassador: false, legend: false }, // badge 縁 et cadre « fil rouge »
    { installed: 3, lotId: null, choiceVouchers: 0, oneOfOne: false, ambassador: false, legend: false }, // lot : 1 Divin
    { installed: 5, lotId: null, choiceVouchers: 1, oneOfOne: false, ambassador: false, legend: false },
    { installed: 10, lotId: null, choiceVouchers: 0, oneOfOne: false, ambassador: false, legend: false }, // lot : 1 booster Mythique + 2 Divins ; badge 募
    { installed: 25, lotId: null, choiceVouchers: 0, oneOfOne: false, ambassador: true, legend: false },
    { installed: 50, lotId: null, choiceVouchers: 2, oneOfOne: false, ambassador: false, legend: false },
    { installed: 100, lotId: null, choiceVouchers: 0, oneOfOne: true, ambassador: false, legend: true },
  ],
  "referral.v2.trustDiscordDays": 30,
  "referral.v2.holdScore": 60,
  "referral.v2.scoreTtlHours": 24,
  "referral.v2.cardLockDays": 14,
  "referral.v2.pairLockDays": 30,
  "referral.v2.announceAt": null, // posée par l'équipe au lancement
  "referral.v2.announceDays": 14,
  "ennichi.enabled": false, // coupé tant que l'équipe ne lance pas la fête
  "ennichi.edition": 1,
  "ennichi.startsAt": null,
  "ennichi.days": 14,
  "ennichi.closingDays": 3,
  "ennichi.stepMultiplier": 2,
  "ennichi.liftCap": true,
  // Seuils choisis le 2026-11-24 ; lots posés par seed:referral (choisis le 2026-11-23), bons du 4e palier
  "ennichi.tiers": [
    { lanterns: 25, lotId: null, choiceVouchers: 0 }, // 30 boosters + 2 Jūbako
    { lanterns: 50, lotId: null, choiceVouchers: 0 }, // 50 boosters + 2 Impériaux + 1 booster Mythique
    { lanterns: 200, lotId: null, choiceVouchers: 0 }, // 80 boosters + 3 boosters Mythiques + 1 Divin
    { lanterns: 500, lotId: null, choiceVouchers: 1 }, // 250 boosters + 3 Divins, et 1 Mythique au choix
  ],
  "ennichi.ranks": [
    { from: 1, to: 1, title: "yokozuna", lotId: null, choiceVouchers: 3, oneOfOne: true },
    { from: 2, to: 3, title: "ozeki", lotId: null, choiceVouchers: 2, oneOfOne: false },
    { from: 4, to: 10, title: "sekiwake", lotId: null, choiceVouchers: 1, oneOfOne: false },
    { from: 11, to: 50, title: null, lotId: null, choiceVouchers: 0, oneOfOne: false }, // lot : 1 Divin
  ],
  "ennichi.omikuji": [
    { lotId: null, oneOfOne: true, count: 1 },
    { lotId: null, oneOfOne: false, count: 20 }, // lot : 1 Divin (posé par le seed)
    { lotId: null, oneOfOne: false, count: 55 }, // lot : 1 booster Mythique (posé par le seed)
  ],
  "ennichi.tierGrantsPerIp": 3,
  "ennichi.excludeStaff": false, // à trancher par Tristan : l'équipe joue comme tout le monde (comportement d'origine)
  "market.enabled": true,
  "market.feeBp": 500, // taxe de 5 % : retire des Zeni du jeu
  "market.minIncrementBp": 500, // surenchère minimale de 5 % (au moins 1 Zeni)
  "market.antiSnipeSeconds": 120, // une mise dans les 2 dernières minutes…
  "market.extendSeconds": 120, // …prolonge la vente de 2 minutes
  "market.durationsHours": [1, 6, 24, 48],
  "market.maxActivePerSeller": 10,
  "market.minAccountAgeHours": 48, // anti-multicomptes
  "market.minStartPrice": 1,
  "market.maxPrice": 10_000_000,
  "market.maxPriceByRarity": {},
  "market.pollSeconds": 15, // rafraîchissement du prix d'une vente ouverte
  "market.quoteWindowDays": 30, // cote = médiane des ventes des 30 derniers jours…
  "market.quoteMinSales": 3, // …à partir de 3 ventes (une vente arrangée ne suffit pas)
  "market.quoteMinSellers": 2, // …venant d'au moins 2 joueurs, chacun ne pesant qu'une voix
  "market.quoteCapMultiplier": 5, // une carte ne vaut pas plus de 5 fois la référence de sa rareté
  "market.quoteHistoryDays": 90, // courbe de la fiche carte
  "market.ordersEnabled": true,
  "market.orderDurationDays": 7, // un avis non rempli rend ses Zeni au bout d'une semaine
  "market.maxOpenOrders": 10, // avis ouverts par joueur, comme les ventes
  "market.orderAlertsPerDay": 0, // sans plafond : le comportement d'avant, à trancher
  "market.orderAlertRarityRef": false, // sans cote, on prévient toujours : le comportement d'avant, à trancher
  "listings.enabled": true,
  "listings.expiryHours": 48,
  "listings.maxWants": 5,
  "listings.maxActive": 10,
  "listings.perDay": 20,
  "listings.maxPendingOffers": 20,
  "listings.allowOther": true,
  "listings.allowedRarities": [...RARITIES, ...VARIANT_RARITIES],
  "battle.enabled": true,
  "battle.stats": { hpBase: 80, hpPerKiPct: 160 }, // 128 à 218 PV
  "battle.damage": { critPermille: 100, critPct: 150, varianceMinPct: 90, varianceMaxPct: 110 },
  "battle.orbs": { start: 1, perTurn: 1, max: 5, secondBonus: 1 },
  "battle.firstTurnActions": 2, // ~53 % de victoires pour le premier joueur en simulation (65 % sans limite)
  "battle.keywordsByRarity": { COMMON: 0, UNCOMMON: 0, RARE: 1, EPIC: 1, LEGENDARY: 2, MYTHIC: 2, BR: 2, AR: 2, VR: 2, GOLD: 3, MR: 3, SR: 3, XR: 4 },
  "battle.keywordValues": {
    poisonPct: 8,
    poisonTurns: 2,
    ripostePct: 50,
    lastWillHealPct: 20,
    revivePct: 25,
    lifestealPct: 30,
    ragePct: 50,
    rageThresholdPct: 50,
    armorPct: 20,
    executePct: 40,
    executeThresholdPct: 60,
    channelOrbs: 2,
  },
  "battle.techniques": {
    ISSEN: { cost: 2, value: 160 }, // coup à ×1,6
    KANTSU: { cost: 2, value: 100 }, // ignore la DEF
    RANBU: { cost: 3, value: 60 }, // tous les ennemis à ×0,6
    IYASHI: { cost: 2, value: 30 }, // soigne 30 % des PV max
    SHUGO: { cost: 2, value: 0 }, // donne 結界
    KOBU: { cost: 2, value: 20 }, // +20 % d'ATK pendant 2 tours
    // Même ordre que TECHNIQUES : l'admin compare les réglages par JSON.stringify, un autre ordre réécrirait la valeur à chaque sauvegarde
    FUIN: { cost: 3, value: 0 }, // la cible passe son prochain tour
    KONSHIN: { cost: 2, value: 240 }, // coup à ×2,4, puis la carte passe son prochain tour
    RENGEKI: { cost: 2, value: 70 }, // 2 coups à ×0,7
    JIU: { cost: 3, value: 15 }, // soigne tous les alliés de 15 %
    DOKUGIRI: { cost: 3, value: 8 }, // empoisonne tous les ennemis, 8 % des PV max par tour
    MEISO: { cost: 0, value: 2 }, // 2 orbes tout de suite
  },
  "battle.turnSeconds": 30,
  "battle.maxMissedTurns": 2,
  "battle.maxTurns": 30,
  "battle.queueSeconds": 20,
  "battle.roomMinutes": 10,
  "battle.botMistakePct": 20,
  "battle.botUpgradePct": 10,
  "battle.botTurnGraceMs": 0, // aucune marge : le comportement d'avant, à trancher (1 500 couvrirait l'animation d'un coup)
  "battle.rewards": { exhibition: 20, bot: 10, friend: 0, ranked: 25, dailyCap: 10 },
  "battle.rewardMinTurns": 3, // chaque camp a fini son premier tour
  "battle.pollSeconds": 3,
  "battle.safetyPollSeconds": 30,
  "battle.queuePollSeconds": 5,
  "battle.lobbyPollSeconds": 15,
  "battle.maxDecks": 10,
  "battle.newAbilityPct": 30,
  "battle.synergyAtkPct": 10, // 58,6 % de victoires en miroir sur 6 000 parties bot contre bot (53,7 % à +5, 62,8 % à +15)
  "battle.abilityShopEnabled": true,
  // Proportionnels à la valeur mesurée (npm run battle:balance, 1 200 parties par ligne, référence sans capacité 51 %) :
  // passifs 100 Zeni par point au-dessus de la référence (100 au minimum), techniques 400 + 50 par point au-dessus de 44 %
  "battle.abilityPrices": {
    keywords: {
      TAUNT: 100, // 38,7 %
      BARRIER: 1950, // 70,6 %
      FLURRY: 3650, // 87,7 %
      POISON: 1200, // 63,2 %
      RIPOSTE: 1050, // 61,3 %
      LAST_WILL: 300, // 53,9 %
      REVIVE: 2600, // 76,8 %
      LIFESTEAL: 1100, // 61,8 %
      RAGE: 800, // 58,8 %
      ARMOR: 1200, // 63,0 %
      EXECUTE: 950, // 60,3 %
      CHANNEL: 1250, // 63,5 %
    },
    techniques: {
      ISSEN: 750, // 51,0 %
      KANTSU: 700, // 49,9 %
      RANBU: 450, // 44,7 %
      IYASHI: 400, // 44,2 %
      SHUGO: 450, // 45,4 %
      KOBU: 350, // 43,3 %
      FUIN: 450, // 44,9 %
      KONSHIN: 800, // 52,4 %
      RENGEKI: 700, // 49,6 %
      JIU: 400, // 44,3 %
      DOKUGIRI: 400, // 44,3 %
      MEISO: 450, // 44,9 %
    },
  },
  "battle.ultimateRarities": ["GOLD", "MR", "SR", "XR"],
  // +50 par action, et la jauge entière pour la moitié des PV perdue : prête au 3e tour de la carte au plus
  // tard, plus tôt si elle encaisse. À +25 et +25, une partie (4 tours par camp) finissait avant : 0 à 14 % d'ultis lancés.
  "battle.ultimateCharge": { perAction: 50, damagePct: 200 },
  // Même ordre que ULTIMATES (comparaison par JSON.stringify dans l'admin). Mesuré par npm run battle:balance,
  // 1 000 parties par ligne, référence sans ulti 51,1 %, cible 58-68 %
  "battle.ultimates": {
    TENCHU: 160, // un coup à ×1,6 qui ignore DEF, Cuirasse et Barrière : 65,7 % (70,2 % à ×2, 73,0 % à ×3)
    HYAKKA: 100, // tous les ennemis à ×1 : 64,5 % (69,3 % à ×1,3)
    KISHI: 80, // relève un allié à 80 % de ses PV : 64,2 %
    FUDO: 0, // Barrière sur tous les alliés, poison retiré : 59,6 %
    TOKIDOME: 0, // tous les ennemis passent leur prochain tour : 66,1 %
  },
  "ranked.enabled": true,
  // Barème du plan (section « Mode classé »)
  "ranked.tiers": {
    BRONZE: { min: 0, win: 30, crushWin: 40, loss: 10, crushLoss: 15 },
    SILVER: { min: 300, win: 27, crushWin: 38, loss: 13, crushLoss: 19 },
    GOLD: { min: 600, win: 24, crushWin: 36, loss: 16, crushLoss: 24 },
    EMERALD: { min: 900, win: 21, crushWin: 34, loss: 19, crushLoss: 28 },
    ELITE: { min: 1200, win: 18, crushWin: 32, loss: 22, crushLoss: 33 },
    CHAMPION: { min: 1500, win: 15, crushWin: 30, loss: 25, crushLoss: 38 },
  },
  "ranked.grandChampion": { min: 1800, top: 100, win: 12, crushWin: 28, loss: 28, crushLoss: 42 },
  "ranked.gapDivisor": 400,
  "ranked.gapCapPct": 50,
  "ranked.crushHpPct": 60,
  "ranked.protectionGames": 3,
  "ranked.matchRange": { base: 150, perSecond: 5, max: 600 },
  "ranked.botPcPct": 50,
  "ranked.botOnDemand": true, // bouton « Combattre contre un bot » en classé aussi : le comportement d'avant, à trancher
  "ranked.botDailyPcCap": 0, // sans plafond : le comportement d'avant, à trancher
  "ranked.samePairDailyCap": 0, // sans limite : le comportement d'avant, à trancher
  "ranked.seasonMonths": 2,
  "ranked.reset": { pivot: 600, keepPct: 50 },
  "ranked.rewardLots": { BRONZE: null, SILVER: null, GOLD: null, EMERALD: null, ELITE: null, CHAMPION: null, GRAND_CHAMPION: null },
  "guest.createPerHourPerIp": 5,
  "guest.retentionDays": 7,
  "multiAccount.retentionDays": 90,
  "multiAccount.seenThrottleMinutes": 30,
  "multiAccount.sharedIpCap": 8,
  "multiAccount.minScore": 40,
  "multiAccount.scoring": DETECTION_SCORING_DEFAULT, // barème d'origine (appareil 60, IP 30…)
  "multiAccount.followDevice": true,
  "multiAccount.followDeviceIpv4": true, // le suivi prend les IPv4 comme les /64 IPv6, comme avant le réglage
  "multiAccount.autoBanMaxOthers": 0, // aucun autre joueur actif coupé par un ban automatique
  "multiAccount.autoBanDays": 30, // un ban automatique n'est jamais définitif sans l'admin
  "multiAccount.autoBanPerDevice": 5,
  "multiAccount.ipv4BanDays": 0, // un ban posé par l'admin vaut jusqu'à sa levée, IPv4 comprise
  "discord.linkBonusZeni": 500, // versé une seule fois, à la première liaison
  "discord.joinModal": JOIN_MODAL_DEFAULT, // désactivé par défaut
  "discord.marketEnabled": false,
  "discord.rankedEnabled": false,
  "discord.casinoEnabled": false,
  "discord.prestigeEnabled": false, // renaissances et gravées tirées, dans DISCORD_PRESTIGE_CHANNEL_ID
  "discord.casinoMinRarity": "LEGENDARY",
  "discord.avatarSyncHours": 24, // chaque joueur actif relu au plus une fois par jour
  "discord.avatarSyncActiveDays": 14,
  "discord.avatarSyncBatch": 10, // 10 requêtes par minute au plus : bien sous les limites de Discord
  "discord.socialPromo": SOCIAL_PROMO_DEFAULT, // masquée par défaut
  "features.casino": true,
  "prestige.enabled": false, // caché tant que l'admin ne l'allume pas
  "prestige.staffLiveWhenDisabled": true, // comme avant : les essais de l'équipe sont réels (choix à trancher)
  // Variantes à 40 % : le booster standard n'en donne presque pas (Gold 2 sur 100 000, BR, VR, MR et XR jamais)
  "prestige.requiredPercent": { COMMON: 85, UNCOMMON: 85, RARE: 85, EPIC: 80, LEGENDARY: 80, MYTHIC: 70, BR: 40, AR: 40, VR: 40, GOLD: 40, MR: 40, XR: 40 },
  "prestige.keepSlots": 20,
  "prestige.minDaysBetween": 0,
  "prestige.maxCopies": 100_000, // au-delà, le joueur recycle d'abord ses doublons
  "prestige.heritageMax": 5,
  "prestige.consecrateMinOwnCycles": 1,
  "prestige.zeniTiers": [{ upTo: 200_000, pct: 100 }, { upTo: 500_000, pct: 50 }],
  "prestige.zeniCap": 500_000,
  "prestige.printing.minPrestige": 1,
  // Gravées : Mythique et au-dessus seulement, 2 % par carte tirée, tirages de 25
  "prestige.printing.chanceBp": { MYTHIC: 200, BR: 200, AR: 200, VR: 200, GOLD: 200, MR: 200, XR: 200 },
  "prestige.printing.sizes": { MYTHIC: 25, BR: 25, AR: 25, VR: 25, GOLD: 25, MR: 25, XR: 25 },
  "prestige.printing.current": 1,
  "prestige.printing.seals": { "1": "初摺" },
  "prestige.printing.recycleMultiplier": 5,
  "prestige.riteStyle": "CINEMATIC",
  "prestige.rebirthBoosterSlug": "mythique", // 1 Mythique garantie
  "prestige.rebirthBoosters": 1,
  "casino.opensAt": null, // teaser « Bientôt » sans compte à rebours, comme avant le casino
  "casino.newBadgeDays": 7,
  "casino.minAccountAgeHours": 48, // comme les enchères et les cadeaux
  "casino.coinflip.enabled": true,
  "casino.coinflip.expiryHours": 24,
  "casino.coinflip.maxOpenTables": 3,
  "casino.coinflip.dailyLimit": 20,
  "casino.coinflip.allowedRarities": [...RARITIES, ...VARIANT_RARITIES],
  "casino.coinflip.lastCopyAllowed": true,
  "casino.coinflip.lobbyPollSeconds": 20,
  "casino.coinflip.tablePollSeconds": 5,
  "casino.coinflip.feedSize": 20,
  "casino.coinflip.feedMaxAgeHours": 72,
  "casino.coinflip.feedBigFrom": "LEGENDARY", // comme le seuil écrit en dur jusqu'ici
  "kyaraImport.enabled": false, // caché tant que l'admin ne l'allume pas
  "kyaraImport.launchAt": null,
  "kyaraImport.windowDays": 7,
  "kyaraImport.staffProfileUrl": null,
  // Valeurs de recyclage des raretés de base (collection.recycleValues)
  "kyaraImport.zeniByRarity": { C: 1, U: 1, R: 3, E: 10, L: 40, M: 150 },
  "kyaraImport.zeniCap": 10_000, // 50 boosters : ne bride que les collections hors norme
  "kyaraImport.retentionDays": 90,
  // Comportement d'avant les plafonds, à choisir par l'admin : sans plafond, relance libre, clé sans fin
  "kyaraImport.autoMaxCards": 0,
  "kyaraImport.autoMaxZeni": 0,
  "kyaraImport.reminderCooldownHours": 0,
  "kyaraImport.staffKeyDays": 0,
  "home.pullFeed.enabled": true,
  "home.pullFeed.minRarity": "LEGENDARY",
  "home.pullFeed.size": 20,
  "home.pullFeed.maxAgeHours": 72,
  "home.pullFeed.refreshSeconds": 60,
  "home.pullFeed.cacheSeconds": 30,
  "home.pullFeed.maxPerPlayer": 5,
  "wrapped.enabled": false,
  "wrapped.year": 2026,
  "wrapped.opensAt": "2026-11-30T23:00:00.000Z", // 1er décembre, 0 h à Paris
  "wrapped.closesAt": "2027-01-31T23:00:00.000Z", // 1er février, 0 h à Paris
  "home.eventGauge.enabled": true,
  "home.eventGauge.startsAt": "2026-11-04T18:00:00.000Z", // 19h à Paris
  "home.eventGauge.endsAt": "2026-11-10T18:00:00.000Z", // 19h à Paris
  "home.eventGauge.goal": 20_000,
  "home.eventGauge.refreshSeconds": 60,
  "home.eventGauge.cacheSeconds": 30,
  "home.eventGauge.metric": "BOOSTERS",
  "home.eventGauge.rewardLotId": null,
  "home.news": NEWS_DEFAULT, // récapitulatif de la v2.5, allumé
  "legal.termsRequiredVersion": 1,
  "account.deletionGraceDays": 30, // anonymisation sous 30 jours (plan, « Pages légales, RGPD »)
  "account.usernameChangeDays": 30,
  "account.exportsPerDay": 3,
  "catalog.size": 6736,
  "catalog.rarityThresholds": { mythic: 300, legendary: 1000, epic: 2500, rare: 5000, uncommon: 7500 },
  "catalog.rarityPolicy": "FROZEN",
  "catalog.stats": { powerMax: 100, powerSpan: 60, kiMin: 30, kiSpan: 56 },
  "catalog.minTagRank": 60,
  "catalog.newCardHours": 48,
  "anilist.perPage": 50,
  "anilist.requestDelayMs": 2100, // 30 requêtes par minute (limite actuelle d'AniList)
  "usage.alertThresholds": DEFAULT_ALERT_THRESHOLDS,
};

/**
 * Réglages validés champ par champ qui gagnent des champs avec le jeu : la valeur enregistrée est complétée
 * par les défauts avant validation. Sans cela, ajouter une capacité effacerait en silence tous les réglages
 * de l'admin sur les autres.
 */
const COMPLETED_KEYS: ReadonlySet<SettingKey> = new Set(["battle.keywordValues", "battle.techniques", "battle.abilityPrices", "battle.ultimates"]);
/** Complétés un niveau plus bas : chaque groupe ({ keywords, techniques }) reçoit les capacités qui lui manquent. */
const NESTED_KEYS: ReadonlySet<SettingKey> = new Set(["battle.abilityPrices"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function completed<K extends SettingKey>(key: K, raw: unknown): unknown {
  if (!COMPLETED_KEYS.has(key) || !isRecord(raw)) return raw;
  const defaults = SETTING_DEFAULTS[key] as Record<string, unknown>;
  if (!NESTED_KEYS.has(key)) return { ...defaults, ...raw };
  return Object.fromEntries(
    Object.entries({ ...defaults, ...raw }).map(([group, value]) => [
      group,
      isRecord(value) && isRecord(defaults[group]) ? { ...defaults[group], ...value } : value,
    ]),
  );
}

/** Valeur stockée validée, ou valeur par défaut si absente ou invalide. */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = SETTING_SCHEMAS[key].safeParse(completed(key, raw));
  return parsed.success ? (parsed.data as SettingValue<K>) : SETTING_DEFAULTS[key];
}
