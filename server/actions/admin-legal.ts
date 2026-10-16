"use server";

import { updateTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { legalDraftSchema, legalPublishSchema, nextLegalVersion } from "@/lib/legal/admin";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { LEGAL_TAG } from "../legal";
import { rateLimit } from "../ratelimit";
import { SETTINGS_TAG } from "../settings";

// Pages légales depuis /admin/legal. Ordre : rôle admin → Zod → rate limit → écriture + AdminLog.
// Une version publiée n'est jamais modifiée : on écrit le brouillon de la version suivante, puis on
// le publie (les anciennes versions restent consultables).

export type AdminLegalError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NO_DRAFT" | "MISSING_FR" | "STALE";
export type AdminLegalResult = { ok: true; version: number } | { ok: false; error: AdminLegalError };

const limited = async (adminId: string) => !(await rateLimit(`admin:${adminId}`, { limit: 20, windowSeconds: 60 })).success;

/** Enregistre le brouillon d'une langue pour la prochaine version (créée au besoin). */
export async function saveLegalDraftAction(input: unknown): Promise<AdminLegalResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = legalDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };
  const { slug, locale, title, body } = parsed.data;

  const version = await prisma.$transaction(async (tx) => {
    const rows = await tx.legalPage.findMany({ where: { slug }, select: { version: true, status: true } });
    const target = rows.find((r) => r.status === "DRAFT")?.version ?? nextLegalVersion(rows.map((r) => r.version));
    const existing = await tx.legalPage.findUnique({
      where: { slug_locale_version: { slug, locale, version: target } },
      select: { id: true },
    });
    if (existing) {
      await tx.legalPage.update({ where: { id: existing.id }, data: { title, body } });
    } else {
      await tx.legalPage.create({ data: { slug, locale, version: target, title, body, status: "DRAFT" } });
    }
    await tx.adminLog.create({
      data: {
        adminId: admin.id,
        action: "LEGAL_DRAFT_SAVE",
        targetType: "LegalPage",
        targetId: `${slug}:${locale}:v${target}`,
        after: { title, length: body.length },
      },
    });
    return target;
  });
  return { ok: true, version };
}

/**
 * Publie la version brouillon d'un slug (texte français obligatoire). Pour les CGU, `forceReaccept`
 * fait passer legal.termsRequiredVersion à cette version : chaque compte inscrit devra la réaccepter.
 */
export async function publishLegalAction(input: unknown): Promise<AdminLegalResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = legalPublishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (await limited(admin.id)) return { ok: false, error: "RATE_LIMITED" };
  const { slug, version, forceReaccept } = parsed.data;
  const force = slug === "cgu" && forceReaccept;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const drafts = await tx.legalPage.findMany({
      where: { slug, version, status: "DRAFT" },
      select: { locale: true, body: true },
    });
    if (drafts.length === 0) return "NO_DRAFT" as const;
    if (!drafts.some((d) => d.locale === "fr" && d.body.trim() !== "")) return "MISSING_FR" as const;
    // Conditionnel : deux publications simultanées, une seule passe
    const published = await tx.legalPage.updateMany({
      where: { slug, version, status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: now, publishedById: admin.id },
    });
    if (published.count === 0) return "STALE" as const;

    let before: number | null = null;
    if (force) {
      const row = await tx.gameSetting.findUnique({ where: { key: "legal.termsRequiredVersion" }, select: { value: true } });
      before = typeof row?.value === "number" ? row.value : 1;
      const value = version as Prisma.InputJsonValue;
      await tx.gameSetting.upsert({
        where: { key: "legal.termsRequiredVersion" },
        create: { key: "legal.termsRequiredVersion", value, updatedBy: admin.id },
        update: { value, updatedBy: admin.id },
      });
    }
    await tx.adminLog.create({
      data: {
        adminId: admin.id,
        action: "LEGAL_PUBLISH",
        targetType: "LegalPage",
        targetId: `${slug}:v${version}`,
        ...(force ? { before: { termsRequiredVersion: before } } : {}),
        after: { locales: drafts.map((d) => d.locale), forceReaccept: force },
      },
    });
    return "OK" as const;
  });
  if (result !== "OK") return { ok: false, error: result };

  updateTag(LEGAL_TAG);
  if (force) updateTag(SETTINGS_TAG);
  return { ok: true, version };
}
