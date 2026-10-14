import { z } from "zod";
import { RARITIES } from "@/lib/catalog/rarity";

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
  // Fuseau du jeu : « aujourd'hui » (anniversaires) et saison AniList en cours
  "game.timeZone": z.string().min(1).max(64).refine(isTimeZone, { message: "Fuseau horaire inconnu" }),
  "collection.recycleValues": recycleValues,
  // Nombre d'emplacements de la vitrine du profil
  "showcase.slots": z.number().int().min(1).max(8),
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
