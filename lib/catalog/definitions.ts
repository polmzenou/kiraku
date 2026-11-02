import { z } from "@/lib/zod";
import { appearanceSchema, VISUAL_PRESETS, type CardAppearance } from "./appearance";
import { BASE_RARITIES } from "./rarity";

export const rarityKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/);
export type RarityDefinition = {
  key: string; nameFr: string; nameEn: string; sortOrder: number; seal: string;
  appearance: CardAppearance; updatedAt?: string;
  /** Les cartes de cette rareté sont des variantes : carte de base et image propre obligatoires. */
  variantRequired?: boolean;
};
const seeds = [
  ["COMMON", "Commune", "Common", "並"], ["UNCOMMON", "Peu commune", "Uncommon", "良"],
  ["RARE", "Rare", "Rare", "稀"], ["EPIC", "Épique", "Epic", "秀"],
  ["LEGENDARY", "Légendaire", "Legendary", "金"], ["MYTHIC", "Mythique", "Mythic", "神"],
] as const;
export const BASE_DEFINITIONS: RarityDefinition[] = [
  ...seeds.map(([key, nameFr, nameEn, seal], i) => ({ key, nameFr, nameEn, sortOrder: i * 100, seal, appearance: {} })),
  // Repli sans base (pages statiques) : mêmes valeurs que les migrations catalogue_variantes_ar_gold et raretes_visuelles.
  // BR = Mythique < AR = VR < Gold = MR < XR
  { key: "BR", nameFr: "Black Rare", nameEn: "Black Rare", sortOrder: 500, seal: "闇", appearance: VISUAL_PRESETS.BR, variantRequired: true },
  { key: "AR", nameFr: "AR", nameEn: "AR", sortOrder: 600, seal: "異", appearance: {}, variantRequired: true },
  { key: "VR", nameFr: "Vitrail Rare", nameEn: "Vitrail Rare", sortOrder: 600, seal: "彩", appearance: VISUAL_PRESETS.VR, variantRequired: true },
  { key: "GOLD", nameFr: "Gold", nameEn: "Gold", sortOrder: 700, seal: "煌", appearance: { artTone: "gold" }, variantRequired: true },
  { key: "MR", nameFr: "Manga Rare", nameEn: "Manga Rare", sortOrder: 700, seal: "漫", appearance: VISUAL_PRESETS.MR, variantRequired: true },
  { key: "XR", nameFr: "Xtreme Rare", nameEn: "Xtreme Rare", sortOrder: 800, seal: "極", appearance: VISUAL_PRESETS.XR, variantRequired: true },
];
export const rarityDefinitionSchema = z.object({
  key: rarityKeySchema, nameFr: z.string().trim().min(1).max(80), nameEn: z.string().trim().max(80),
  sortOrder: z.number().int().min(-100_000).max(100_000), seal: z.string().trim().min(1).max(8),
  appearance: appearanceSchema, updatedAt: z.string().optional(), variantRequired: z.boolean().optional(),
}).strict();
const isBase = (key: string) => (BASE_RARITIES as readonly string[]).includes(key);
/**
 * Ordre du registre. Les tirages, la pitié et les missions comparent des positions dans cette liste : à rang égal,
 * la rareté de base passe d'abord, pour qu'une BR compte comme « Mythique ou mieux ».
 */
export function compareRarities(a: { key: string; sortOrder: number }, b: { key: string; sortOrder: number }) {
  return a.sortOrder - b.sortOrder || Number(isBase(b.key)) - Number(isBase(a.key)) || a.key.localeCompare(b.key);
}
export function orderedKeys(definitions: readonly RarityDefinition[]) {
  return [...definitions].sort(compareRarities).map((r) => r.key);
}
