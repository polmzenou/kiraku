"use server";

import { refresh } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { PRESTIGE_COSMETICS } from "@/lib/prestige/cosmetics";
import { z } from "@/lib/zod";
import { getAdmin } from "../admin";
import { writeAdminLog } from "../admin/log";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";

// Prestige dans l'admin. Rôle admin → Zod → rate limit → écriture et journal dans la même transaction.

export type InstallCosmeticsResult = { ok: true; created: number } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" };

const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

/**
 * Installe le jeu de cosmétiques du prestige (titres, cadres tensei, hanga et hono, pseudo or) : seuls les identifiants
 * absents sont créés ; un cosmétique déjà présent, même modifié dans l'admin, n'est jamais touché.
 */
export async function adminInstallPrestigeCosmeticsAction(input: unknown): Promise<InstallCosmeticsResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  if (!z.object({}).strict().safeParse(input).success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  const created = await prisma.$transaction(async (tx) => {
    const existing = new Set(
      (await tx.cosmetic.findMany({ where: { slug: { in: PRESTIGE_COSMETICS.map((c) => c.slug) } }, select: { slug: true } })).map((c) => c.slug),
    );
    const missing = PRESTIGE_COSMETICS.filter((c) => !existing.has(c.slug));
    if (missing.length === 0) return 0;
    const { count } = await tx.cosmetic.createMany({
      data: missing.map((c) => ({
        kind: c.kind,
        slug: c.slug,
        label: json(c.label),
        hint: json(c.hint),
        frameStyle: c.frameStyle ?? null,
        nameColor: c.nameColor ?? null,
        condition: json(c.condition),
        sortOrder: c.sortOrder,
        active: true,
      })),
      skipDuplicates: true,
    });
    await writeAdminLog(tx, {
      adminId: admin.id,
      action: "PRESTIGE_COSMETICS_INSTALL",
      targetType: "Cosmetic",
      targetId: null,
      after: json({ slugs: missing.map((c) => c.slug) }),
    });
    return count;
  });
  refresh();
  return { ok: true, created };
}
