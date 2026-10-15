import { z } from "zod";
import { RARITIES } from "@/lib/catalog/rarity";
import { MAX_SHOWCASE_SLOTS } from "@/lib/collection/showcase";
import { rotationPinSchema } from "@/lib/boosters/rotation";

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

const rarity = z.enum(RARITIES);

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Parts de tirage par rareté, en millièmes de % (entiers : aucun arrondi de flottant au tirage)
const rarityRates = z
  .object(Object.fromEntries(RARITIES.map((r) => [r, z.number().int().min(0).max(1_000_000)])) as {
    [R in (typeof RARITIES)[number]]: z.ZodNumber;
  })
  .refine((rates) => RARITIES.some((r) => rates[r] > 0), { message: "Au moins une rareté doit avoir une part" });

// Zeni rendus par doublon recyclé, par rareté
const recycleValues = z.object(
  Object.fromEntries(RARITIES.map((r) => [r, z.number().int().min(0).max(100_000)])) as {
    [R in (typeof RARITIES)[number]]: z.ZodNumber;
  },
);

const cardStats = z.object({
  powerMax: z.number().int().min(1).max(999),
  powerSpan: z.number().int().min(0).max(999),
  kiMin: z.number().int().min(0).max(999),
  kiSpan: z.number().int().min(0).max(999),
});

// Id d'un Lot (cuid), ou null
const lotRef = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).nullable();

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
  // Booster divin : 1 chance sur N (0 = désactivé)
  "booster.divineOdds": z.number().int().min(0).max(1_000_000),
  // Taille minimale du pool d'un type de booster pour être proposé (un type peut l'abaisser)
  "booster.minPool": z.number().int().min(1).max(10_000),
  // Rotation des familles « Par démographie » et « Par genre » : durée d'une sélection et nombre de types proposés
  "booster.rotationHours": z.number().int().min(1).max(24 * 7),
  "booster.rotationDemographie": z.number().int().min(0).max(50),
  "booster.rotationGenre": z.number().int().min(0).max(50),
  // Sélection épinglée par l'admin pour la fenêtre en cours (null = hasard)
  "booster.rotationPin": rotationPinSchema.nullable(),
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
  "gifts.allowedRarities": z.array(rarity).max(RARITIES.length),
  "notifications.retentionDays": z.number().int().min(1).max(365),
  // Intervalle de sondage de la cloche et des toasts (onglet visible seulement)
  "notifications.pollSeconds": z.number().int().min(10).max(600),
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
  "market.pollSeconds": z.number().int().min(2).max(120),
  "guest.createPerHourPerIp": z.number().int().min(1).max(1_000),
  "discord.linkBonusZeni": z.number().int().min(0).max(100_000),
  "catalog.size": z.number().int().min(10).max(50_000),
  "catalog.rarityThresholds": rarityThresholds,
  // FROZEN : une carte garde la rareté de sa première apparition ; LIVE : elle suit son rang
  "catalog.rarityPolicy": z.enum(["FROZEN", "LIVE"]),
  "catalog.stats": cardStats,
  "catalog.minTagRank": z.number().int().min(0).max(100),
  "anilist.perPage": z.number().int().min(1).max(50),
  "anilist.requestDelayMs": z.number().int().min(500).max(60_000),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  "economy.startingZeni": 500,
  "booster.maxStock": 10,
  "booster.intervalMinutes": 10,
  // Parts de Kyara (total 99 975) : 0,025 % · 0,15 % · 1,4 % · 11,4 % · 25 % · 62 %
  "booster.rates": { COMMON: 62_000, UNCOMMON: 25_000, RARE: 11_400, EPIC: 1_400, LEGENDARY: 150, MYTHIC: 25 },
  "booster.slotFloors": ["COMMON", "COMMON", "UNCOMMON", "RARE"],
  "booster.pityThreshold": 250,
  "booster.goldenEvery": 10,
  "booster.goldenFloor": "EPIC",
  "booster.divineOdds": 2000,
  "booster.minPool": 100,
  "booster.rotationHours": 12,
  "booster.rotationDemographie": 2,
  "booster.rotationGenre": 4,
  "booster.rotationPin": null,
  "game.timeZone": "Europe/Paris",
  // Valeurs de Kyara : 1 · 1 · 3 · 10 · 40 · 150 Zeni
  "collection.recycleValues": { COMMON: 1, UNCOMMON: 1, RARE: 3, EPIC: 10, LEGENDARY: 40, MYTHIC: 150 },
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
  "gifts.allowedRarities": [...RARITIES],
  "notifications.retentionDays": 30,
  "notifications.pollSeconds": 20,
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
  "market.pollSeconds": 5, // rafraîchissement du prix d'une vente ouverte
  "guest.createPerHourPerIp": 5,
  "discord.linkBonusZeni": 500, // versé une seule fois, à la première liaison
  "catalog.size": 6736,
  "catalog.rarityThresholds": { mythic: 300, legendary: 1000, epic: 2500, rare: 5000, uncommon: 7500 },
  "catalog.rarityPolicy": "FROZEN",
  "catalog.stats": { powerMax: 100, powerSpan: 60, kiMin: 30, kiSpan: 56 },
  "catalog.minTagRank": 60,
  "anilist.perPage": 50,
  "anilist.requestDelayMs": 2100, // 30 requêtes par minute (limite actuelle d'AniList)
};

/** Valeur stockée validée, ou valeur par défaut si absente ou invalide. */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = SETTING_SCHEMAS[key].safeParse(raw);
  return parsed.success ? (parsed.data as SettingValue<K>) : SETTING_DEFAULTS[key];
}
