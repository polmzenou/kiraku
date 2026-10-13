import type { SettingValue } from "@/lib/settings/defaults";

// Rareté par percentile de rang et stats de combat (section « Raretés et taux de drop » du plan).

export const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"] as const;
export type Rarity = (typeof RARITIES)[number];

export type RarityThresholds = SettingValue<"catalog.rarityThresholds">;
export type StatCoefficients = SettingValue<"catalog.stats">;
export type RarityPolicy = SettingValue<"catalog.rarityPolicy">;

/** Rareté du rang `rank` (1 = le plus populaire) parmi `total` cartes, en arithmétique entière. */
export function rarityForRank(rank: number, total: number, t: RarityThresholds): Rarity {
  // rank / total <= seuil / 10 000, sans flottant : les bornes tombent toujours du même côté
  const within = (bp: number) => rank * 10_000 <= bp * total;
  if (within(t.mythic)) return "MYTHIC";
  if (within(t.legendary)) return "LEGENDARY";
  if (within(t.epic)) return "EPIC";
  if (within(t.rare)) return "RARE";
  if (within(t.uncommon)) return "UNCOMMON";
  return "COMMON";
}

/** 力 Puissance et 気 Ki, qui baissent avec le rang. */
export function statsFor(rank: number, total: number, k: StatCoefficients) {
  const p = total > 0 ? rank / total : 1;
  return {
    power: Math.round(k.powerMax - k.powerSpan * p),
    ki: Math.round(k.kiMin + k.kiSpan * (1 - Math.sqrt(p))),
  };
}

export type RankInput = { anilistId: number; favorites: number; position: number };

export type RankedEntry<T extends RankInput> = T & {
  rank: number;
  rarity: Rarity;
  power: number;
  ki: number;
};

export type RankOptions = {
  target: number;
  thresholds: RarityThresholds;
  stats: StatCoefficients;
  policy: RarityPolicy;
  /** Rareté actuelle des cartes déjà en base, par anilistId (politique FROZEN). */
  existingRarity: ReadonlyMap<number, Rarity>;
};

/**
 * Classe les personnages récupérés : dédoublonnage, tri par favoris (puis ordre AniList, puis id),
 * les `target` premiers reçoivent rang, rareté et stats. Fonction pure et déterministe.
 */
export function rankCatalog<T extends RankInput>(rows: readonly T[], opts: RankOptions): RankedEntry<T>[] {
  // En cas de doublon (un personnage qui a changé de page pendant l'import), on garde le plus récent : plus de favoris
  const unique = new Map<number, T>();
  for (const row of rows) {
    const seen = unique.get(row.anilistId);
    if (!seen || row.favorites > seen.favorites) unique.set(row.anilistId, row);
  }

  const sorted = [...unique.values()].sort(
    (a, b) => b.favorites - a.favorites || a.position - b.position || a.anilistId - b.anilistId,
  );
  const kept = sorted.slice(0, Math.max(0, opts.target));
  const total = kept.length;

  return kept.map((row, i) => {
    const rank = i + 1;
    const computed = rarityForRank(rank, total, opts.thresholds);
    const rarity = opts.policy === "FROZEN" ? (opts.existingRarity.get(row.anilistId) ?? computed) : computed;
    return { ...row, rank, rarity, ...statsFor(rank, total, opts.stats) };
  });
}

/** Nombre de cartes par rareté. */
export function countByRarity(entries: readonly { rarity: Rarity }[]): Record<Rarity, number> {
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const e of entries) counts[e.rarity] += 1;
  return counts;
}

/** Sceau kanji de chaque rareté (direction artistique : raretés = matières). */
export const RARITY_SEAL: Record<Rarity, string> = {
  COMMON: "並",
  UNCOMMON: "良",
  RARE: "稀",
  EPIC: "秀",
  LEGENDARY: "金",
  MYTHIC: "神",
};
