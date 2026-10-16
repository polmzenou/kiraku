import { z } from "@/lib/zod";
import { LEGAL_LOCALES, LEGAL_SLUGS } from "./legal";

// Saisie de l'admin des pages légales : brouillon d'une langue, puis publication d'une version.

export const LEGAL_TITLE_MAX = 120;
export const LEGAL_BODY_MAX = 60_000;

export const legalDraftSchema = z.object({
  slug: z.enum(LEGAL_SLUGS),
  locale: z.enum(LEGAL_LOCALES),
  title: z.string().trim().min(1).max(LEGAL_TITLE_MAX),
  // Le texte anglais peut rester vide : la page retombe alors sur le français
  body: z.string().max(LEGAL_BODY_MAX),
});

export const legalPublishSchema = z.object({
  slug: z.enum(LEGAL_SLUGS),
  version: z.number().int().min(1).max(10_000),
  forceReaccept: z.boolean(),
});

/** Prochaine version d'un slug : au-dessus de tout ce qui existe (publié ou brouillon). */
export function nextLegalVersion(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}
