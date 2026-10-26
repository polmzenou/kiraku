"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { cleanChatBody } from "@/lib/chat/message";
import { BADGES, BIO_MAX } from "@/lib/profile/conditions";
import { z } from "@/lib/zod";
import { isFrozen } from "@/lib/account/deletion";
import { prisma } from "../db";
import { getCosmeticOptions, getEarnedBadges } from "../profile/progress";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Personnalisation de son profil. Session → Zod → compte inscrit actif → rate limit → chaque titre,
// cadre, couleur de pseudo et badge choisi est revérifié comme débloqué ici ; les champs sont écrits un
// par un. Un cosmétique déjà porté le reste même si le joueur est repassé sous son palier (le catalogue
// grandit, le % découvert baisse) : seul un nouveau choix est revérifié.

export type ProfileSaveError = "NO_SESSION" | "INVALID" | "GUEST" | "UNAVAILABLE" | "RATE_LIMITED" | "LOCKED";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const saveSchema = z
  .object({
    bio: z.string().max(BIO_MAX * 2),
    titleAgreement: z.enum(["MASC", "FEM"]),
    titleId: id.nullable(),
    frameId: id.nullable(),
    nameColorId: id.nullable(),
    badgeOrder: z.array(z.enum(BADGES)).max(BADGES.length),
  })
  .strict();

export async function saveProfileAction(input: unknown): Promise<{ ok: true } | { ok: false; error: ProfileSaveError }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (user.isGuest) return { ok: false, error: "GUEST" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  if (!(await rateLimit(`profile-save:${user.id}`, { limit: 10, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  const data = parsed.data;
  const bio = data.bio.trim() === "" ? null : cleanChatBody(data.bio, BIO_MAX);
  if (data.bio.trim() !== "" && bio === null) return { ok: false, error: "INVALID" };

  const worn = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true, titleId: true, frameId: true, nameColorId: true } });
  // Propriété : un titre, un cadre ou une couleur se porte seulement s'il est débloqué (et du bon type)
  const picks = [
    { id: data.titleId, kind: "TITLE", worn: worn.titleId },
    { id: data.frameId, kind: "FRAME", worn: worn.frameId },
    { id: data.nameColorId, kind: "NAME_COLOR", worn: worn.nameColorId },
  ] as const;
  const toCheck = picks.filter((p) => p.id !== null && p.id !== p.worn);
  if (toCheck.length > 0) {
    const options = await getCosmeticOptions(user.id, await getLocale());
    const allowed = (p: (typeof picks)[number]) => options.some((o) => o.id === p.id && o.kind === p.kind && o.progress.unlocked);
    if (!toCheck.every(allowed)) return { ok: false, error: "LOCKED" };
  }
  const earned = new Set<string>(await getEarnedBadges({ ...user, createdAt: worn.createdAt }));
  const badgeOrder = [...new Set(data.badgeOrder)].filter((b) => earned.has(b));

  await prisma.user.update({
    where: { id: user.id },
    data: { bio, titleAgreement: data.titleAgreement, titleId: data.titleId, frameId: data.frameId, nameColorId: data.nameColorId, badgeOrder },
    select: { id: true },
  });
  refresh();
  return { ok: true };
}
