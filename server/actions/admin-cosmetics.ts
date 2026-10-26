"use server";

import { refresh } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { cosmeticInputSchema } from "@/lib/profile/cosmetic-form";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import { writeAdminLog } from "../admin/log";
import { getRarities } from "../catalog/rarities";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";

// Titres, cadres et couleurs de pseudo (/admin/cosmetiques). Rôle admin → Zod → rate limit → écriture et
// journal (COSMETIC_SAVE) dans la même transaction. Champs écrits un par un.

export type CosmeticSaveResult = { ok: true; id: string } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "SLUG_TAKEN" | "NOT_FOUND" };

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

export async function adminSaveCosmeticAction(input: unknown): Promise<CosmeticSaveResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = cosmeticInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  const c = parsed.data;

  // Références vérifiées : la rareté existe dans le registre, la série existe
  if (c.condition.type === "RARITY_OWNED" && !(await getRarities()).includes(c.condition.rarity)) return { ok: false, error: "INVALID" };
  if (c.condition.type === "RARITIES_DISCOVERED") {
    const known = await getRarities();
    if (!c.condition.rarities.every((r) => known.includes(r))) return { ok: false, error: "INVALID" };
  }
  if (c.condition.type === "SERIES_COMPLETE" && !(await prisma.series.findUnique({ where: { id: c.condition.seriesId }, select: { id: true } }))) {
    return { ok: false, error: "INVALID" };
  }

  const label = { fr: c.label.fr, ...(c.label.frFem ? { frFem: c.label.frFem } : {}), ...(c.label.en ? { en: c.label.en } : {}) };
  const data = {
    kind: c.kind,
    slug: c.slug,
    label: json(label),
    hint: json({ fr: c.hint.fr, en: c.hint.en }),
    frameStyle: c.frameStyle,
    nameColor: c.nameColor,
    condition: json(c.condition),
    sortOrder: c.sortOrder,
    active: c.active,
  };
  try {
    const id = await prisma.$transaction(async (tx) => {
      const before = c.id ? await tx.cosmetic.findUnique({ where: { id: c.id } }) : null;
      if (c.id && !before) return null;
      const saved = c.id
        ? await tx.cosmetic.update({ where: { id: c.id }, data, select: { id: true } })
        : await tx.cosmetic.create({ data, select: { id: true } });
      await writeAdminLog(tx, {
        adminId: admin.id,
        action: "COSMETIC_SAVE",
        targetType: "Cosmetic",
        targetId: saved.id,
        before: before ? json(before) : undefined,
        after: json(data),
      });
      return saved.id;
    });
    if (!id) return { ok: false, error: "NOT_FOUND" };
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") return { ok: false, error: "SLUG_TAKEN" };
    throw e;
  }
}

/** Séries par titre, pour la condition « série complète ». */
export async function adminSearchSeriesAction(input: unknown): Promise<{ id: string; title: string; cards: number }[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const parsed = z.string().trim().min(2).max(100).safeParse(input);
  if (!parsed.success || !(await rateLimit(`admin-series-search:${admin.id}`, { limit: 60, windowSeconds: 60 })).success) return [];
  const rows = await prisma.series.findMany({
    where: { OR: [{ titleRomaji: { contains: parsed.data, mode: "insensitive" } }, { titleEnglish: { contains: parsed.data, mode: "insensitive" } }] },
    orderBy: { titleRomaji: "asc" },
    take: 20,
    select: { id: true, titleRomaji: true, titleEnglish: true, _count: { select: { cards: true } } },
  });
  return rows.map((s) => ({ id: s.id, title: s.titleEnglish ? `${s.titleRomaji} · ${s.titleEnglish}` : s.titleRomaji, cards: s._count.cards }));
}
