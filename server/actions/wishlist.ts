"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { isFrozen } from "@/lib/account/deletion";
import { setWishlistWith, WishlistError } from "../collection/wishlist-core";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

export type WishlistActionError = "NO_SESSION" | "INVALID" | "FULL" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE";
const schema = z.object({ cardId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/), wished: z.boolean() }).strict();

/** Le joueur ciblé vient uniquement de la session ; les invités peuvent également préparer leur liste. */
export async function setWishlistAction(input: unknown): Promise<{ ok: true; wished: boolean } | { ok: false; error: WishlistActionError }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  if (!(await rateLimit(`wishlist:${user.id}`, { limit: 60, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    const wished = await setWishlistWith(prisma, user.id, parsed.data.cardId, parsed.data.wished);
    refresh();
    return { ok: true, wished };
  } catch (e) {
    if (e instanceof WishlistError && (e.code === "FULL" || e.code === "NOT_FOUND")) return { ok: false, error: e.code };
    if (!(e instanceof WishlistError)) console.error("[wishlist] enregistrement impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}
