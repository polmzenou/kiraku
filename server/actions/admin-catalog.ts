"use server";

import { updateTag } from "next/cache";
import { z } from "@/lib/zod";
import { bulkCatalogSchema, cardFormSchema, rarityFormSchema, type BulkCatalogResult, type CatalogResult } from "@/lib/catalog/admin-form";
import { validCardImageUrl } from "@/lib/catalog/media";
import { getStaff } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { CATALOG_TAG } from "../catalog/queries";
import { RARITIES_TAG } from "../catalog/rarities";
import { SETTINGS_TAG } from "../settings";
import { BOOSTER_TYPES_TAG } from "../boosters/pools";
import { bulkCatalogWith, CatalogMutationError, deleteCatalogCardWith, saveCatalogCardWith, setCatalogCardStatusWith, saveRarityWith } from "../catalog/admin-core";

/** Équipe connectée (ADMIN ou DEV) ; `adminOnly` ferme l'action au DEV (publication, archivage, raretés). */
async function guard(adminOnly = false) {
  const staff = await getStaff();
  if (!staff || (adminOnly && staff.scope !== "full")) return { error: "FORBIDDEN" as const };
  if (!(await rateLimit(`admin-catalog:${staff.user.id}`, { limit: 30, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" as const };
  return { admin: staff.user, scope: staff.scope };
}
function invalidate() { for (const tag of [CATALOG_TAG, BOOSTER_TYPES_TAG, RARITIES_TAG, SETTINGS_TAG]) updateTag(tag); }
function failure(error: unknown): CatalogResult {
  if (error instanceof CatalogMutationError) return { ok: false, error: error.code };
  console.error("[admin-catalog] save failed", error);
  return { ok: false, error: "SAVE_FAILED" };
}
export async function saveCatalogCard(input: unknown): Promise<CatalogResult> {
  const g = await guard(); if ("error" in g) return { ok: false, error: g.error! };
  const parsed = cardFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID", fields: parsed.error.issues.map((i) => i.path.join(".")) };
  if (parsed.data.imageUrl && !validCardImageUrl(parsed.data.imageUrl, process.env.BLOB_PUBLIC_HOST)) return { ok: false, error: "IMAGE_INVALID" };
  try { const result = await saveCatalogCardWith(prisma, g.admin.id, parsed.data, g.scope); invalidate(); return { ok: true, ...result }; }
  catch (error) { return failure(error); }
}
const statusSchema = z.object({ id: z.string().min(1).max(64), updatedAt: z.iso.datetime(), status: z.enum(["ARCHIVED", "DRAFT"]) }).strict();
export async function setCatalogCardStatus(input: unknown): Promise<CatalogResult> {
  const g = await guard(true); if ("error" in g) return { ok: false, error: g.error! };
  const parsed = statusSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "INVALID" };
  try { const v = parsed.data; const result = await setCatalogCardStatusWith(prisma, g.admin.id, v.id, v.updatedAt, v.status); invalidate(); return { ok: true, ...result }; }
  catch (error) { return failure(error); }
}
const deleteSchema = z.object({ id: z.string().min(1).max(64), updatedAt: z.iso.datetime() }).strict();
export async function deleteCatalogCard(input: unknown): Promise<CatalogResult> {
  const g = await guard(); if ("error" in g) return { ok: false, error: g.error! };
  const parsed = deleteSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "INVALID" };
  try { const result = await deleteCatalogCardWith(prisma, g.admin.id, parsed.data.id, parsed.data.updatedAt, g.scope); invalidate(); return { ok: true, ...result }; }
  catch (error) { return failure(error); }
}
export async function bulkCatalogAction(input: unknown): Promise<BulkCatalogResult> {
  const g = await guard(true); if ("error" in g) return { ok: false, error: g.error! };
  const parsed = bulkCatalogSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "INVALID" };
  try { const result = await bulkCatalogWith(prisma, g.admin.id, parsed.data); if (result.updated) invalidate(); return { ok: true, ...result }; }
  catch (error) { const f = failure(error); return { ok: false, error: f.ok ? "SAVE_FAILED" : f.error }; }
}
export async function saveCatalogRarity(input: unknown): Promise<CatalogResult> {
  const g = await guard(true); if ("error" in g) return { ok: false, error: g.error! };
  const parsed = rarityFormSchema.safeParse(input); if (!parsed.success) return { ok: false, error: "INVALID" };
  try { const result = await saveRarityWith(prisma, g.admin.id, parsed.data); invalidate(); return { ok: true, ...result }; }
  catch (error) { return failure(error); }
}
