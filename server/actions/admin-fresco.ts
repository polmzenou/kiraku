"use server";

import { updateTag } from "next/cache";
import { del } from "@vercel/blob";
import { z } from "@/lib/zod";
import { frescoInputSchema, frescoNameSchema } from "@/lib/fresco/admin";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { createFrescoWith, deleteFrescoWith, FrescoAdminError, saveFrescoWith, setFrescoStatusWith, type FrescoAdminErrorCode } from "../fresco/admin-core";
import { FRESCO_TAG } from "../fresco/queries";

// Fresques depuis /admin/fresques (admin seulement). Ordre : rôle admin → Zod → rate limit → transaction avec
// une ligne AdminLog → cache des fresques invalidé (effet immédiat sur les chutes et l'onglet Nouveautés).

export type AdminFrescoError = FrescoAdminErrorCode | "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE";
export type AdminFrescoResult<T = object> = ({ ok: true } & T) | { ok: false; error: AdminFrescoError };

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

async function guard() {
  const admin = await getAdmin();
  if (!admin) return { error: "FORBIDDEN" as const };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" as const };
  return { admin };
}

async function run<T extends object>(work: (adminId: string) => Promise<T>): Promise<AdminFrescoResult<T>> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error! };
  try {
    const out = await work(g.admin.id);
    updateTag(FRESCO_TAG);
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof FrescoAdminError) return { ok: false, error: e.code };
    console.error("[admin-fresco] écriture impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}

/** Nouvelle fresque en brouillon : seul son nom est demandé, le reste se règle dans l'éditeur. */
export async function createFrescoAction(input: unknown): Promise<AdminFrescoResult<{ id: string }>> {
  const parsed = z.object({ name: frescoNameSchema.shape.fr }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  return run(async (adminId) => ({ id: await createFrescoWith(prisma, adminId, parsed.data.name) }));
}

export async function saveFrescoAction(input: unknown): Promise<AdminFrescoResult> {
  const parsed = z.object({ id, fresco: frescoInputSchema }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  return run(async (adminId) => {
    await saveFrescoWith(prisma, adminId, parsed.data.id, parsed.data.fresco);
    return {};
  });
}

export async function setFrescoStatusAction(input: unknown): Promise<AdminFrescoResult> {
  const parsed = z.object({ id, status: z.enum(["PUBLISHED", "ARCHIVED"]) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  return run(async (adminId) => {
    await setFrescoStatusWith(prisma, adminId, parsed.data.id, parsed.data.status);
    return {};
  });
}

export async function deleteFrescoAction(input: unknown): Promise<AdminFrescoResult> {
  const parsed = z.object({ id }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  return run(async (adminId) => {
    const urls = await deleteFrescoWith(prisma, adminId, parsed.data.id);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (urls.length > 0 && token) await del(urls, { token }).catch((e) => console.error("[admin-fresco] images non supprimées", e));
    return {};
  });
}

