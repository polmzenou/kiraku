import { z } from "zod";
import { RARITIES } from "@/lib/catalog/rarity";
import { poolFilterSchema, type PoolFilter } from "./pool-filter";
import {
  BOOSTER_FAMILIES,
  BOOSTER_KINDS,
  BOOSTER_SHAPES,
  boosterThemeSchema,
  localizedSchema,
  slugSchema,
  type BoosterTypeView,
} from "./types";

// Formulaire /admin/boosters/types : un type de booster (ou une bannière vedette) modifié ou créé.
// Chaque champ est validé ici, puis écrit un par un côté serveur (jamais l'objet reçu tel quel).

/** Un ou deux kanji (ou kana) pour l'étiquette. */
const emblemSchema = z
  .string()
  .trim()
  .regex(/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{1,2}$/u, "Un ou deux kanji");

const dateSchema = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Date invalide")
  .nullable();

export const boosterTypeFormSchema = z
  .object({
    mode: z.enum(["create", "update"]),
    slug: slugSchema,
    kind: z.enum(BOOSTER_KINDS),
    family: z.enum(BOOSTER_FAMILIES),
    name: localizedSchema,
    tagline: z.object({ fr: z.string().trim().max(80), en: z.string().trim().max(80) }).strict(),
    emblem: emblemSchema,
    shape: z.enum(BOOSTER_SHAPES),
    theme: boosterThemeSchema,
    // Le formulaire envoie des champs vides : on les retire avant de valider le filtre
    filter: z.preprocess((raw) => (raw && typeof raw === "object" ? cleanFilter(raw as Record<string, unknown>) : raw), poolFilterSchema),
    slotFloors: z.array(z.enum(RARITIES)).max(20),
    usesFreeStock: z.boolean(),
    priceZeni: z.number().int().min(0).max(1_000_000).nullable(),
    countsForPity: z.boolean(),
    bonusEligible: z.boolean(),
    featuredCardIds: z.array(z.string().min(1).max(40)).max(50),
    featuredRate: z.number().int().min(0).max(10_000),
    featuredPity: z.number().int().min(0).max(10_000),
    minPoolSize: z.number().int().min(1).max(10_000).nullable(),
    startsAt: dateSchema,
    endsAt: dateSchema,
    active: z.boolean(),
  })
  .strict()
  .refine((v) => !v.startsAt || !v.endsAt || Date.parse(v.startsAt) < Date.parse(v.endsAt), {
    message: "La fin doit suivre le début",
    path: ["endsAt"],
  });

export type BoosterTypeForm = z.infer<typeof boosterTypeFormSchema>;

/** Valeurs de départ du formulaire à partir d'un type existant. */
export function formFromType(type: BoosterTypeView): BoosterTypeForm {
  return {
    mode: "update",
    slug: type.slug,
    kind: type.kind,
    family: type.family,
    name: type.name,
    tagline: type.tagline,
    emblem: type.emblem,
    shape: type.shape,
    theme: type.theme,
    filter: type.filter ?? {},
    slotFloors: type.slotFloors,
    usesFreeStock: type.usesFreeStock,
    priceZeni: type.priceZeni,
    countsForPity: type.countsForPity,
    bonusEligible: type.bonusEligible,
    featuredCardIds: type.featuredCardIds,
    featuredRate: type.featuredRate,
    featuredPity: type.featuredPity,
    minPoolSize: type.minPoolSize,
    startsAt: type.startsAt?.toISOString() ?? null,
    endsAt: type.endsAt?.toISOString() ?? null,
    active: type.active,
  };
}

/** Nouvelle bannière vedette : pool complet, vedettes à choisir, pitié vedette à 100, inactive. */
export function newBannerForm(): BoosterTypeForm {
  return {
    mode: "create",
    slug: "banniere-",
    kind: "BANNER",
    family: "special",
    name: { fr: "", en: "" },
    tagline: { fr: "", en: "" },
    emblem: "星",
    shape: "SACHET",
    theme: { base: "#24386A", dark: "#080E20", pattern: "kin", ink: "light" },
    filter: {},
    slotFloors: [],
    usesFreeStock: true,
    priceZeni: 200,
    countsForPity: true,
    bonusEligible: true,
    featuredCardIds: [],
    featuredRate: 5000,
    featuredPity: 100,
    minPoolSize: null,
    startsAt: null,
    endsAt: null,
    active: false,
  };
}

/** Filtre sans champs vides (le formulaire envoie des listes vides et des chaînes vides). */
export function cleanFilter(filter: Record<string, unknown>): PoolFilter {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as PoolFilter;
}
