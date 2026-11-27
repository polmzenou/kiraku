"use server";

import { isSpoilerKey, SPOILER_SHOWN_MAX } from "@/lib/spoiler";
import { z } from "@/lib/zod";
import { getSpoilerUniverses } from "../catalog/spoiler-universes";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Mode spoiler du compte (/compte, menu « Plus », /compte/spoilers). Session → Zod → rate limit → écriture du seul
// compte de la session, champ par champ. Préférence d'affichage : aucun effet sur le jeu, rien à journaliser.

export type SpoilerResult = { ok: true } | { ok: false; error: "NO_SESSION" | "INVALID" | "RATE_LIMITED" | "UNKNOWN_UNIVERSE" | "FULL" };

const blurSchema = z.object({ blur: z.boolean() }).strict();
const universeSchema = z.object({ key: z.string().refine(isSpoilerKey), shown: z.boolean() }).strict();

/** Large : un joueur enchaîne vite les interrupteurs de la liste des univers. */
async function allowed(userId: string) {
  return (await rateLimit(`spoiler:${userId}`, { limit: 60, windowSeconds: 60 })).success;
}

/** « Flouter les spoils » (true, défaut) ou « Tout afficher » (false). */
export async function setSpoilerBlurAction(input: unknown): Promise<SpoilerResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = blurSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await allowed(user.id))) return { ok: false, error: "RATE_LIMITED" };
  await prisma.user.update({ where: { id: user.id }, data: { spoilerBlur: parsed.data.blur } });
  return { ok: true };
}

/**
 * Remet en clair (shown) ou floute de nouveau les cartes spoil d'un univers. Ajouter exige un univers qui a des cartes
 * spoil ; retirer accepte toute clé (un univers fusionné ou supprimé depuis). Mise à jour atomique du tableau.
 */
export async function setSpoilerUniverseAction(input: unknown): Promise<SpoilerResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = universeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await allowed(user.id))) return { ok: false, error: "RATE_LIMITED" };
  const { key, shown } = parsed.data;

  if (!shown) {
    await prisma.$executeRaw`UPDATE "User" SET "spoilerShown" = array_remove("spoilerShown", ${key}) WHERE id = ${user.id}`;
    return { ok: true };
  }
  const known = await getSpoilerUniverses("fr");
  if (!known.some((u) => u.key === key)) return { ok: false, error: "UNKNOWN_UNIVERSE" };
  // Sans doublon, et jamais au-delà du plafond (CHECK de la colonne) : 0 ligne touchée = liste pleine
  const updated = await prisma.$executeRaw`
    UPDATE "User" SET "spoilerShown" = array_append(array_remove("spoilerShown", ${key}), ${key})
    WHERE id = ${user.id} AND (${key} = ANY("spoilerShown") OR cardinality("spoilerShown") < ${SPOILER_SHOWN_MAX})`;
  return updated === 1 ? { ok: true } : { ok: false, error: "FULL" };
}

/** « Tout reflouter » : plus aucun univers en clair. */
export async function resetSpoilerUniversesAction(): Promise<SpoilerResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!(await allowed(user.id))) return { ok: false, error: "RATE_LIMITED" };
  await prisma.user.update({ where: { id: user.id }, data: { spoilerShown: [] } });
  return { ok: true };
}
