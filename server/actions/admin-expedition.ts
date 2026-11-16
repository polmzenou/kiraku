"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import type { Prisma } from "@/generated/prisma/client";
import { expeditionTypeInputSchema } from "@/lib/expedition/admin-form";
import { getAdmin } from "../admin";
import { writeAdminLog } from "../admin/log";
import { prisma } from "../db";
import { ExpeditionError, recallWith, seedCatalogWith } from "../expedition/expedition-core";
import { rateLimit } from "../ratelimit";

// Expéditions depuis /admin/expeditions. Ordre : rôle admin → Zod → rate limit → références vérifiées →
// transaction avec une ligne AdminLog. Chaque champ écrit est choisi un par un, jamais l'objet reçu.

export type AdminExpeditionError =
  | "FORBIDDEN"
  | "INVALID"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "SLUG_TAKEN"
  | "UNKNOWN_REF"
  | "IN_USE"
  | "NO_BOOSTER";

type Failure = { ok: false; error: AdminExpeditionError };

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const idInput = z.object({ id: idSchema }).strict();

async function guard(): Promise<{ adminId: string } | { error: "FORBIDDEN" | "RATE_LIMITED" }> {
  const admin = await getAdmin();
  if (!admin) return { error: "FORBIDDEN" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" };
  return { adminId: admin.id };
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

class RefError extends Error {
  constructor(readonly code: AdminExpeditionError) {
    super(code);
  }
}

/** Crée ou modifie un modèle. Les expéditions déjà lancées gardent leur photo : rien ne change pour elles. */
export async function saveExpeditionTypeAction(input: unknown): Promise<{ ok: true; id: string } | Failure> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = expeditionTypeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const v = parsed.data;
  const data = {
    slug: v.slug,
    name: json(v.name),
    lore: json(v.lore),
    minRarity: v.minRarity,
    risk: v.risk,
    durationMinutes: v.durationMinutes,
    baseSuccessPct: v.baseSuccessPct,
    maxSuccessPct: v.maxSuccessPct,
    maxTriumphPct: v.maxTriumphPct,
    minDiscoveryPct: v.minDiscoveryPct,
    zeni: v.zeni,
    boosterTypeId: v.boosterTypeId,
    boosters: v.boosters,
    extraLotId: v.extraLotId,
    weight: v.weight,
    active: v.active,
    sortOrder: v.sortOrder,
  };
  try {
    const id = await prisma.$transaction(async (tx) => {
      const [rarity, booster, lot, sameSlug] = await Promise.all([
        tx.rarityDefinition.findUnique({ where: { key: v.minRarity }, select: { key: true } }),
        tx.boosterType.findUnique({ where: { id: v.boosterTypeId }, select: { kind: true } }),
        v.extraLotId ? tx.lot.findUnique({ where: { id: v.extraLotId }, select: { id: true } }) : null,
        tx.expeditionType.findUnique({ where: { slug: v.slug }, select: { id: true } }),
      ]);
      // Un sachet scellé (DROP) ne se verse pas en crédits : il passe par un lot bonus
      if (!rarity || !booster || booster.kind === "DROP" || (v.extraLotId && !lot)) throw new RefError("UNKNOWN_REF");
      if (sameSlug && sameSlug.id !== v.id) throw new RefError("SLUG_TAKEN");
      if (v.id) {
        const before = await tx.expeditionType.findUnique({ where: { id: v.id } });
        if (!before) throw new RefError("NOT_FOUND");
        await tx.expeditionType.update({ where: { id: v.id }, data });
        await writeAdminLog(tx, { adminId: g.adminId, action: "EXPEDITION_TYPE_UPDATE", targetType: "ExpeditionType", targetId: v.id, before: json(before), after: json(data) });
        return v.id;
      }
      const created = await tx.expeditionType.create({ data, select: { id: true } });
      await writeAdminLog(tx, { adminId: g.adminId, action: "EXPEDITION_TYPE_CREATE", targetType: "ExpeditionType", targetId: created.id, after: json(data) });
      return created.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, error: e.code };
    throw e;
  }
}

/** Supprime un modèle jamais joué ; un modèle déjà joué se désactive (son historique y renvoie). */
export async function deleteExpeditionTypeAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  try {
    await prisma.$transaction(async (tx) => {
      const type = await tx.expeditionType.findUnique({ where: { id: parsed.data.id }, include: { _count: { select: { expeditions: true } } } });
      if (!type) throw new RefError("NOT_FOUND");
      if (type._count.expeditions > 0) throw new RefError("IN_USE");
      await tx.expeditionType.delete({ where: { id: type.id } });
      const { _count, ...before } = type;
      void _count;
      await writeAdminLog(tx, { adminId: g.adminId, action: "EXPEDITION_TYPE_DELETE", targetType: "ExpeditionType", targetId: type.id, before: json(before) });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, error: e.code };
    throw e;
  }
}

/** Installe les modèles par défaut absents (jamais d'écrasement). */
export async function seedExpeditionCatalogAction(input: unknown): Promise<{ ok: true; created: number; skipped: number } | Failure> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (!z.object({}).strict().safeParse(input ?? {}).success) return { ok: false, error: "INVALID" };
  try {
    const res = await seedCatalogWith(prisma, { adminId: g.adminId, now: new Date() });
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    if (e instanceof ExpeditionError && e.code === "NO_BOOSTER") return { ok: false, error: "NO_BOOSTER" };
    throw e;
  }
}

/** Rappelle une expédition en route (modération) : cartes rendues, aucun gain, aucune attente. */
export async function recallExpeditionAction(input: unknown): Promise<{ ok: true } | Failure> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  try {
    await recallWith(prisma, { adminId: g.adminId, expeditionId: parsed.data.id, now: new Date() });
    refresh();
    return { ok: true };
  } catch (e) {
    if (e instanceof ExpeditionError) return { ok: false, error: "NOT_FOUND" };
    throw e;
  }
}
