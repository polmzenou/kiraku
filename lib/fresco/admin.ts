import { z } from "@/lib/zod";

// Saisie de l'admin pour une fresque (/admin/fresques/[id]) : champs choisis un par un, validés ici et
// relus côté serveur (univers, types de booster et lots existants).

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const lot = id.nullable();

export const frescoNameSchema = z.object({
  fr: z.string().trim().min(1).max(60),
  en: z.string().trim().max(60).optional(),
});

export const frescoInputSchema = z
  .object({
    name: frescoNameSchema,
    universeId: id.nullable(),
    spoiler: z.boolean(),
    boosterTypeIds: z.array(id).max(100),
    dropWeight: z.number().int().min(0).max(1_000),
    lots: z.object({ piece: lot, row: lot, column: lot, complete: lot }).strict(),
  })
  .strict();

export type FrescoInput = z.infer<typeof frescoInputSchema>;

export const FRESCO_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type FrescoStatus = (typeof FRESCO_STATUSES)[number];

/** Passages de statut permis : publier un brouillon ou une archive, archiver une fresque publiée. */
export function canMoveTo(from: FrescoStatus, to: FrescoStatus): boolean {
  if (to === "PUBLISHED") return from === "DRAFT" || from === "ARCHIVED";
  if (to === "ARCHIVED") return from === "PUBLISHED";
  return false;
}

/** Brouillon par défaut d'une nouvelle fresque. */
export const EMPTY_FRESCO_INPUT: FrescoInput = {
  name: { fr: "", en: "" },
  universeId: null,
  spoiler: false,
  boosterTypeIds: [],
  dropWeight: 1,
  lots: { piece: null, row: null, column: null, complete: null },
};
