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
// cadre et badge choisi est revérifié comme débloqué ici ; les champs sont écrits un par un.

export type ProfileSaveError = "NO_SESSION" | "INVALID" | "GUEST" | "UNAVAILABLE" | "RATE_LIMITED" | "LOCKED";

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const saveSchema = z
  .object({
    bio: z.string().max(BIO_MAX * 2),
    titleAgreement: z.enum(["MASC", "FEM"]),
    titleId: id.nullable(),
    frameId: id.nullable(),
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

  // Propriété : un titre ou un cadre se porte seulement s'il est débloqué (et du bon type)
  if (data.titleId || data.frameId) {
    const options = await getCosmeticOptions(user.id, await getLocale());
    const allowed = (optionId: string, kind: "TITLE" | "FRAME") => options.some((o) => o.id === optionId && o.kind === kind && o.progress.unlocked);
    if ((data.titleId && !allowed(data.titleId, "TITLE")) || (data.frameId && !allowed(data.frameId, "FRAME"))) {
      return { ok: false, error: "LOCKED" };
    }
  }
  const created = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } });
  const earned = new Set<string>(await getEarnedBadges({ ...user, createdAt: created.createdAt }));
  const badgeOrder = [...new Set(data.badgeOrder)].filter((b) => earned.has(b));

  await prisma.user.update({
    where: { id: user.id },
    data: { bio, titleAgreement: data.titleAgreement, titleId: data.titleId, frameId: data.frameId, badgeOrder },
    select: { id: true },
  });
  refresh();
  return { ok: true };
}
