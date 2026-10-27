import { z } from "@/lib/zod";
import { appearanceSchema } from "./appearance";
import { rarityDefinitionSchema, rarityKeySchema } from "./definitions";
import { KEYWORDS } from "@/lib/battle/types";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const cardFormSchema = z.object({
  id: id.optional(), updatedAt: z.iso.datetime().optional(),
  name: z.string().trim().min(1).max(200), nameNative: nullableText(200),
  imageUrl: z.string().max(2048), description: z.object({ fr: z.string().max(20_000), en: z.string().max(20_000) }).strict(),
  rarity: rarityKeySchema, power: z.number().int().min(0).max(999), ki: z.number().int().min(0).max(999),
  appearance: appearanceSchema, dropWeight: z.number().int().min(0).max(1_000_000),
  boosterIds: z.array(id).max(200), boosterExclusive: z.boolean(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  seriesId: id.nullable(), newSeries: z.object({
    title: z.string().trim().min(1).max(300), titleEnglish: z.string().trim().max(300),
    type: z.enum(["ANIME", "MANGA", "CUSTOM"]), genres: z.array(z.string().trim().min(1).max(60)).max(20),
    tags: z.array(z.string().trim().min(1).max(60)).max(20),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).nullable().optional(),
    seasonYear: z.number().int().min(1900).max(2100).nullable().optional(),
    studio: z.string().trim().max(200).nullable().optional(),
  }).strict().nullable(),
  gender: nullableText(40), role: z.enum(["MAIN", "SUPPORTING", "BACKGROUND"]).nullable(),
  birthMonth: z.number().int().min(1).max(12).nullable(), birthDay: z.number().int().min(1).max(31).nullable(),
  variantOfId: id.nullable(), formName: nullableText(120),
}).strict().superRefine((c, ctx) => {
  if (!c.seriesId && !c.newSeries) ctx.addIssue({ code: "custom", path: ["seriesId"], message: "SERIES_REQUIRED" });
  if (c.seriesId && c.newSeries) ctx.addIssue({ code: "custom", path: ["seriesId"], message: "INVALID" });
  if (c.status === "PUBLISHED" && !c.imageUrl) ctx.addIssue({ code: "custom", path: ["imageUrl"], message: "IMAGE_REQUIRED" });
  if (c.id && !c.updatedAt) ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "CONFLICT" });
});
export type CardDraft = z.infer<typeof cardFormSchema>;
export const rarityFormSchema = rarityDefinitionSchema.extend({
  create: z.boolean(), template: rarityKeySchema,
  rate: z.number().int().min(0).max(1_000_000), recycleValue: z.number().int().min(0).max(100_000),
  keywords: z.number().int().min(0).max(KEYWORDS.length), gifts: z.boolean(), trades: z.boolean(),
}).strict();
export type RarityDraft = z.infer<typeof rarityFormSchema>;
export type CatalogError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "CONFLICT" | "UNKNOWN_RARITY" | "UNKNOWN_BOOSTER" | "IMAGE_INVALID" | "IMAGE_REQUIRED" | "KEY_TAKEN" | "SAVE_FAILED"
  | "VARIANT_REQUIRED" | "VARIANT_INVALID" | "VARIANT_IMAGE_REUSED" | "IN_USE";
export type CatalogResult = { ok: true; id: string; updatedAt: string; seriesId?: string } | { ok: false; error: CatalogError; fields?: string[] };

export const BULK_ACTIONS = ["publish", "archive", "restore", "setRarity", "addBooster", "removeBooster"] as const;
export const bulkCatalogSchema = z.object({
  ids: z.array(id).min(1).max(100), action: z.enum(BULK_ACTIONS),
  rarity: rarityKeySchema.optional(), boosterId: id.optional(),
}).strict().superRefine((v, ctx) => {
  if (v.action === "setRarity" && !v.rarity) ctx.addIssue({ code: "custom", path: ["rarity"], message: "INVALID" });
  if ((v.action === "addBooster" || v.action === "removeBooster") && !v.boosterId) ctx.addIssue({ code: "custom", path: ["boosterId"], message: "INVALID" });
});
export type BulkCatalogInput = z.infer<typeof bulkCatalogSchema>;
export type BulkCatalogResult = { ok: true; updated: number; rejected: { id: string; error: CatalogError }[] } | { ok: false; error: CatalogError };
export function blankCard(seriesId: string | null = null): CardDraft {
  return { name: "", nameNative: null, imageUrl: "", description: { fr: "", en: "" }, rarity: "COMMON", power: 40, ki: 30,
    appearance: {}, dropWeight: 1, boosterIds: [], boosterExclusive: false, status: "DRAFT", seriesId,
    newSeries: null, gender: null, role: null, birthMonth: null, birthDay: null, variantOfId: null, formName: null };
}
