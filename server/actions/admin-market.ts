"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { clearNoteWith, NOTE_KINDS, NoteModerationError } from "../market/note-moderation-core";
import { rateLimit } from "../ratelimit";

// Modération des commentaires du Marché (poubelle à côté du texte, et /admin/marche). Ordre :
// rôle admin → Zod → rate limit → transaction avec une ligne AdminLog. Le client n'envoie que l'id.

export type ClearNoteResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "UNAVAILABLE" };

const clearSchema = z.object({ kind: z.enum(NOTE_KINDS), id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }).strict();

/** Efface le commentaire d'une annonce d'échange ou d'une vente. */
export async function clearMarketNoteAction(input: unknown): Promise<ClearNoteResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    await clearNoteWith(prisma, { adminId: admin.id, kind: parsed.data.kind, id: parsed.data.id });
  } catch (e) {
    if (e instanceof NoteModerationError) return { ok: false, error: e.code };
    console.error("[admin marche] effacement de commentaire", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
  refresh();
  return { ok: true };
}
