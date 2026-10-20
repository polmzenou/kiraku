import { z } from "@/lib/zod";
import { appearanceSchema, type CardAppearance } from "./appearance";

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
  // Repli sans base (pages statiques) : mêmes valeurs que la migration catalogue_variantes_ar_gold
  { key: "AR", nameFr: "AR", nameEn: "AR", sortOrder: 600, seal: "異", appearance: {}, variantRequired: true },
  { key: "GOLD", nameFr: "Gold", nameEn: "Gold", sortOrder: 700, seal: "煌", appearance: { artTone: "gold" }, variantRequired: true },
];
export const rarityDefinitionSchema = z.object({
  key: rarityKeySchema, nameFr: z.string().trim().min(1).max(80), nameEn: z.string().trim().max(80),
  sortOrder: z.number().int().min(-100_000).max(100_000), seal: z.string().trim().min(1).max(8),
  appearance: appearanceSchema, updatedAt: z.string().optional(), variantRequired: z.boolean().optional(),
}).strict();
export function orderedKeys(definitions: readonly RarityDefinition[]) {
  return [...definitions].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)).map((r) => r.key);
}
