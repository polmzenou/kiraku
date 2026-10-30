import { z } from "@/lib/zod";
import { rarityKeySchema } from "@/lib/catalog/definitions";
import { RARITIES, VARIANT_RARITIES } from "@/lib/catalog/rarity";
import { MAX_SHOWCASE_SLOTS } from "@/lib/collection/showcase";
import { rotationPinSchema } from "@/lib/boosters/rotation";
import { slugSchema } from "@/lib/boosters/types";
import { KEYWORDS, TECHNIQUES } from "@/lib/battle/types";
import { JOIN_MODAL_DEFAULT, joinModalSchema } from "@/lib/discord/join-modal";
import { NEWS_DEFAULT, newsSchema } from "@/lib/home/news-schema";
import { alertThresholdsSchema, DEFAULT_ALERT_THRESHOLDS } from "@/lib/usage/quota";

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
});

const battleTechniques = z.object(
  Object.fromEntries(
    TECHNIQUES.map((t) => [t, z.object({ cost: z.number().int().min(0).max(20), value: z.number().int().min(0).max(1_000) })]),
  ) as { [T in (typeof TECHNIQUES)[number]]: z.ZodObject<{ cost: z.ZodNumber; value: z.ZodNumber }> },
);

const keywordsByRarity = z.record(rarityKeySchema, z.number().int().min(0).max(KEYWORDS.length));

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

// Lot de fin de saison par meilleur rang atteint
const rankedRewardLots = z.object(
  Object.fromEntries([...LADDER_KEYS, "GRAND_CHAMPION"].map((k) => [k, lotRef])) as {
    [K in (typeof LADDER_KEYS)[number] | "GRAND_CHAMPION"]: typeof lotRef;
  },
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
  // Nombre d'emplacements de la vitrine du profil
  "showcase.slots": z.number().int().min(1).max(MAX_SHOWCASE_SLOTS),
  // Social (étape 6) : interrupteurs, limites anti-spam et anti-farm des cadeaux
  "social.enabled": z.boolean(),
  "friends.max": z.number().int().min(1).max(5_000),
  "friends.maxOutgoingPending": z.number().int().min(1).max(500),
  // Délai avant de pouvoir redemander après un refus ou une annulation
  "friends.requestCooldownHours": z.number().int().min(0).max(24 * 90),
  "gifts.enabled": z.boolean(),
  "gifts.perDaySent": z.number().int().min(0).max(100),
  "gifts.perDayReceived": z.number().int().min(0).max(100),
  "gifts.minAccountAgeHours": z.number().int().min(0).max(24 * 365),
  "gifts.minFriendshipHours": z.number().int().min(0).max(24 * 365),
  "gifts.boosterPriceZeni": z.number().int().min(1).max(1_000_000),
  "gifts.allowedRarities": z.array(rarity).max(200),
  // Sachets scellés offerts : compte lié à Discord, ancienneté, nombre par semaine glissante
  "gifts.sealedRequiresDiscord": z.boolean(),
  "gifts.sealedMinAccountDays": z.number().int().min(0).max(365),
  "gifts.sealedPerWeek": z.number().int().min(0).max(50),
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
  "battle.rewards": battleRewards,
  // Sondage de secours du plateau quand le temps réel (Ably) n'est pas configuré
  "battle.pollSeconds": z.number().int().min(1).max(30),
  // Resynchronisation de secours du plateau quand le temps réel est actif
  "battle.safetyPollSeconds": z.number().int().min(5).max(300),
  // Sondage de la file d'attente et du salon d'un code ami (complété par le temps réel)
  "battle.queuePollSeconds": z.number().int().min(2).max(60),
  "battle.lobbyPollSeconds": z.number().int().min(2).max(120),
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
  "ranked.seasonMonths": z.number().int().min(1).max(12),
  // Fin de saison : au-dessus du pivot, on garde keepPct % de l'excédent
  "ranked.reset": z.object({ pivot: z.number().int().min(0).max(100_000), keepPct: z.number().int().min(0).max(100) }),
  "ranked.rewardLots": rankedRewardLots,
  "guest.createPerHourPerIp": z.number().int().min(1).max(1_000),
  // Invités sans activité supprimés après ce nombre de jours (0 = jamais), par le cron des comptes
  "guest.retentionDays": z.number().int().min(0).max(365),
  "discord.linkBonusZeni": z.number().int().min(0).max(100_000),
  // Modal « Rejoins notre Discord » : lien, textes fr/en, déclencheur et fréquence
  "discord.joinModal": joinModalSchema,
  "discord.marketEnabled": z.boolean(),
  // Interrupteurs de fonctionnalités sans module propre (casino : tuile « Bientôt » seulement)
  "features.casino": z.boolean(),
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
  "anilist.perPage": z.number().int().min(1).max(50),
  "anilist.requestDelayMs": z.number().int().min(500).max(60_000),
  // Seuils du bandeau de consommation du serveur (/admin/general), en % de la capacité
  "usage.alertThresholds": alertThresholdsSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  "economy.startingZeni": 500,
  "booster.maxStock": 10,
  "booster.intervalMinutes": 10,
  // Parts de Kyara (total 99 975) : 0,025 % · 0,15 % · 1,4 % · 11,4 % · 25 % · 62 %
  // AR et Gold (variantes au-dessus de Mythique) prennent 10 des 25 parts Mythique : « Mythique ou mieux »
  // reste à 0,025 %, et sans carte AR/Gold publiée le tirage retombe sur Mythique.
  "booster.rates": { COMMON: 62_000, UNCOMMON: 25_000, RARE: 11_400, EPIC: 1_400, LEGENDARY: 150, MYTHIC: 15, AR: 8, GOLD: 2 },
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
  "booster.duplicateGuardRarities": ["MYTHIC", "AR", "GOLD"], // liste vide = règle coupée
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
  "collection.recycleValues": { COMMON: 1, UNCOMMON: 1, RARE: 3, EPIC: 10, LEGENDARY: 40, MYTHIC: 150, AR: 450, GOLD: 1050 },
  "showcase.slots": 4,
  "social.enabled": true,
  "friends.max": 200,
  "friends.maxOutgoingPending": 20,
  "friends.requestCooldownHours": 72,
  "gifts.enabled": true,
  "gifts.perDaySent": 3,
  "gifts.perDayReceived": 5,
  "gifts.minAccountAgeHours": 48, // comme les enchères
  "gifts.minFriendshipHours": 24,
  "gifts.boosterPriceZeni": 200, // prix du booster standard
  "gifts.allowedRarities": [...RARITIES, ...VARIANT_RARITIES],
  "gifts.sealedRequiresDiscord": true,
  "gifts.sealedMinAccountDays": 7,
  "gifts.sealedPerWeek": 1,
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
  "battle.keywordsByRarity": { COMMON: 0, UNCOMMON: 0, RARE: 1, EPIC: 1, LEGENDARY: 2, MYTHIC: 2, AR: 2, GOLD: 3 },
  "battle.keywordValues": { poisonPct: 8, poisonTurns: 2, ripostePct: 50, lastWillHealPct: 20, revivePct: 25 },
  "battle.techniques": {
    ISSEN: { cost: 2, value: 160 }, // coup à ×1,6
    KANTSU: { cost: 2, value: 100 }, // ignore la DEF
    RANBU: { cost: 3, value: 60 }, // tous les ennemis à ×0,6
    IYASHI: { cost: 2, value: 30 }, // soigne 30 % des PV max
    SHUGO: { cost: 2, value: 0 }, // donne 結界
    KOBU: { cost: 2, value: 20 }, // +20 % d'ATK pendant 2 tours
    FUIN: { cost: 3, value: 0 }, // la cible passe son prochain tour
  },
  "battle.turnSeconds": 30,
  "battle.maxMissedTurns": 2,
  "battle.maxTurns": 30,
  "battle.queueSeconds": 20,
  "battle.roomMinutes": 10,
  "battle.botMistakePct": 20,
  "battle.botUpgradePct": 10,
  "battle.rewards": { exhibition: 20, bot: 10, friend: 0, ranked: 25, dailyCap: 10 },
  "battle.pollSeconds": 3,
  "battle.safetyPollSeconds": 30,
  "battle.queuePollSeconds": 5,
  "battle.lobbyPollSeconds": 15,
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
  "ranked.seasonMonths": 2,
  "ranked.reset": { pivot: 600, keepPct: 50 },
  "ranked.rewardLots": { BRONZE: null, SILVER: null, GOLD: null, EMERALD: null, ELITE: null, CHAMPION: null, GRAND_CHAMPION: null },
  "guest.createPerHourPerIp": 5,
  "guest.retentionDays": 7,
  "discord.linkBonusZeni": 500, // versé une seule fois, à la première liaison
  "discord.joinModal": JOIN_MODAL_DEFAULT, // désactivé par défaut
  "discord.marketEnabled": false,
  "features.casino": true,
  "home.pullFeed.enabled": true,
  "home.pullFeed.minRarity": "LEGENDARY",
  "home.pullFeed.size": 20,
  "home.pullFeed.maxAgeHours": 72,
  "home.pullFeed.refreshSeconds": 60,
  "home.pullFeed.cacheSeconds": 30,
  "home.pullFeed.maxPerPlayer": 5,
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
  "anilist.perPage": 50,
  "anilist.requestDelayMs": 2100, // 30 requêtes par minute (limite actuelle d'AniList)
  "usage.alertThresholds": DEFAULT_ALERT_THRESHOLDS,
};

/** Valeur stockée validée, ou valeur par défaut si absente ou invalide. */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = SETTING_SCHEMAS[key].safeParse(raw);
  return parsed.success ? (parsed.data as SettingValue<K>) : SETTING_DEFAULTS[key];
}
