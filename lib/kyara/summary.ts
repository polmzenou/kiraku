import { z } from "@/lib/zod";
import type { KyaraPlan, OutcomeKind } from "./plan";

/** Issues converties en Zeni, dans l'ordre d'affichage du résumé. */
export const CONVERTED_KINDS = ["OWNED", "ABOVE", "MISSING", "UNPUBLISHED"] as const satisfies readonly OutcomeKind[];

// Résumé gardé avec un import versé (KyaraImport.summary) : issues, cartes par rareté, copies ignorées, plafond et
// meilleures cartes (vignettes de la page du joueur). Écrit par le versement, relu par la page.

export const SUMMARY_TOP_CARDS = 12;

export type KyaraImportSummary = {
  byKind: Record<OutcomeKind, { count: number; zeni: number }>;
  byRarity: Record<string, number>;
  extraCopies: number;
  capped: boolean;
  /** Cartes versées les plus rares, ids de Card. */
  top: string[];
};

export function importSummary(plan: KyaraPlan, sortOrder: ReadonlyMap<string, number>): KyaraImportSummary {
  const byRarity: Record<string, number> = {};
  for (const g of plan.grant) byRarity[g.rarity] = (byRarity[g.rarity] ?? 0) + 1;
  const top = [...plan.grant]
    .sort((a, b) => (sortOrder.get(b.rarity) ?? 0) - (sortOrder.get(a.rarity) ?? 0) || (a.cardId < b.cardId ? -1 : 1))
    .slice(0, SUMMARY_TOP_CARDS)
    .map((g) => g.cardId);
  return { byKind: plan.byKind, byRarity, extraCopies: plan.extraCopies, capped: plan.capped, top };
}

const count = z.number().int().min(0);
const kindTotal = z.object({ count, zeni: count });
const summarySchema = z.object({
  byKind: z.object({ CARD: kindTotal, OWNED: kindTotal, ABOVE: kindTotal, MISSING: kindTotal, UNPUBLISHED: kindTotal }),
  byRarity: z.record(z.string().max(40), count),
  extraCopies: count,
  capped: z.boolean(),
  top: z.array(z.string().max(40)).max(SUMMARY_TOP_CARDS),
});

/** Résumé relu en base, ou null s'il manque ou a une autre forme (la page retombe sur les totaux). */
export function parseImportSummary(json: unknown): KyaraImportSummary | null {
  const parsed = summarySchema.safeParse(json);
  return parsed.success ? (parsed.data as KyaraImportSummary) : null;
}
