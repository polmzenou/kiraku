"use server";

import { refresh } from "next/cache";
import { cleanUniverseName } from "@/lib/catalog/universes";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import {
  addSeriesToUniverseWith,
  createUniverseWith,
  deleteUniverseWith,
  mergeUniversesWith,
  removeSeriesFromUniverseWith,
  renameUniverseWith,
  UniverseError,
  type UniverseErrorCode,
} from "../catalog/universes-core";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";

// Univers de séries (/admin/univers). Rôle admin → Zod → rate limit → transaction et journal.

export type UniverseResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNEXPECTED" | UniverseErrorCode };

const id = z.string().min(1).max(64);
const name = z.string().transform((raw, ctx) => cleanUniverseName(raw) ?? (ctx.addIssue({ code: "custom" }), z.NEVER));

const createSchema = z.object({ name }).strict();
const renameSchema = z.object({ universeId: id, name }).strict();
const seriesSchema = z.object({ universeId: id, seriesId: id }).strict();
const mergeSchema = z.object({ fromId: id, intoId: id }).strict();
const deleteSchema = z.object({ universeId: id }).strict();

/** Vérifie le rôle puis les entrées puis le débit, et traduit les erreurs du cœur. */
async function guarded<T>(schema: z.ZodType<T>, input: unknown, write: (adminId: string, data: T) => Promise<unknown>): Promise<UniverseResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  // Plus large que les autres écrans : corriger un regroupement enchaîne vite les ajouts et retraits
  if (!(await rateLimit(`admin-universes:${admin.id}`, { limit: 60, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await write(admin.id, parsed.data);
  } catch (e) {
    if (e instanceof UniverseError) return { ok: false, error: e.code };
    console.error("[admin-universes]", e);
    return { ok: false, error: "UNEXPECTED" };
  }
  refresh();
  return { ok: true };
}

export async function adminCreateUniverseAction(input: unknown): Promise<UniverseResult> {
  return guarded(createSchema, input, (adminId, v) => createUniverseWith(prisma, adminId, v.name));
}

export async function adminRenameUniverseAction(input: unknown): Promise<UniverseResult> {
  return guarded(renameSchema, input, (adminId, v) => renameUniverseWith(prisma, adminId, v.universeId, v.name));
}

export async function adminAddSeriesToUniverseAction(input: unknown): Promise<UniverseResult> {
  return guarded(seriesSchema, input, (adminId, v) => addSeriesToUniverseWith(prisma, adminId, v.universeId, v.seriesId));
}

export async function adminRemoveSeriesFromUniverseAction(input: unknown): Promise<UniverseResult> {
  return guarded(seriesSchema, input, (adminId, v) => removeSeriesFromUniverseWith(prisma, adminId, v.universeId, v.seriesId));
}

export async function adminMergeUniversesAction(input: unknown): Promise<UniverseResult> {
  return guarded(mergeSchema, input, (adminId, v) => mergeUniversesWith(prisma, adminId, v.fromId, v.intoId));
}

export async function adminDeleteUniverseAction(input: unknown): Promise<UniverseResult> {
  return guarded(deleteSchema, input, (adminId, v) => deleteUniverseWith(prisma, adminId, v.universeId));
}
