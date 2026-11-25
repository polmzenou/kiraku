"use server";

import { refresh } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { lotInputSchema } from "@/lib/economy/lots";
import { missionInputSchema } from "@/lib/economy/missions";
import { shopItemInputSchema, type ShopContentIssue } from "@/lib/economy/shop";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { itemsContentIssue, lotContentIssue } from "../economy/shop-guard";
import { lotRefsExist, LotSaveError, writeLotWith } from "../economy/lot-save";
import { rateLimit } from "../ratelimit";
import { writeAdminLog } from "../admin/log";

// Lots, missions et articles de boutique depuis /admin. Ordre : rôle admin → Zod →
// rate limit → références vérifiées → transaction avec une ligne AdminLog (avant / après).
// Chaque champ écrit est choisi un par un, jamais l'objet reçu.

export type AdminEconomyError =
  | "FORBIDDEN"
  | "INVALID"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "KEY_TAKEN"
  | "UNKNOWN_REF"
  // Contenu qu'un article de la boutique ne vend jamais
  | "SHOP_SEALED"
  | "SHOP_MYTHIC";

export type AdminEconomyResult = { ok: true; id: string } | { ok: false; error: AdminEconomyError };

async function guard(): Promise<{ adminId: string } | { error: "FORBIDDEN" | "RATE_LIMITED" }> {
  const admin = await getAdmin();
  if (!admin) return { error: "FORBIDDEN" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" };
  return { adminId: admin.id };
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Contenu refusé par la boutique → erreur du formulaire. */
const SHOP_ISSUE_ERROR = {
  SEALED: "SHOP_SEALED",
  MYTHIC: "SHOP_MYTHIC",
} as const satisfies Record<ShopContentIssue, AdminEconomyError>;

class RefError extends Error {
  constructor(readonly code: AdminEconomyError) {
    super(code);
  }
}

// --- Lots ---

export async function saveLotAction(input: unknown): Promise<AdminEconomyResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = lotInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const v = parsed.data;

  // Références : types de boosters et cartes qui existent
  if (!(await lotRefsExist(prisma, v.items))) return { ok: false, error: "UNKNOWN_REF" };
  // Lot vendu par un article actif en Zeni : même règle qu'à la mise en vente (saveShopItemAction)
  if (v.id && (await prisma.shopItem.count({ where: { lotId: v.id, active: true, priceZeni: { not: null } } })) > 0) {
    const issue = await itemsContentIssue(v.items);
    if (issue) return { ok: false, error: SHOP_ISSUE_ERROR[issue] };
  }

  try {
    const id = await writeLotWith(prisma, v, { staffId: g.adminId, actions: { create: "LOT_CREATE", update: "LOT_UPDATE" } });
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof LotSaveError) return { ok: false, error: e.code };
    throw e;
  }
}

// --- Missions ---

export async function saveMissionAction(input: unknown): Promise<AdminEconomyResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = missionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const v = parsed.data;
  if (!(await prisma.lot.findUnique({ where: { id: v.lotId }, select: { id: true } }))) {
    return { ok: false, error: "UNKNOWN_REF" };
  }

  const data = {
    key: v.key,
    period: v.period,
    metric: v.metric,
    goal: v.goal,
    rarity: v.metric === "PULL_RARITY" ? v.rarity : null,
    title: v.title ? { fr: v.title.fr, en: v.title.en } : undefined,
    lotId: v.lotId,
    active: v.active,
    sortOrder: v.sortOrder,
  };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const before = v.id ? await tx.mission.findUnique({ where: { id: v.id } }) : null;
      if (v.id && !before) throw new RefError("NOT_FOUND");
      const taken = await tx.mission.findUnique({ where: { key: v.key }, select: { id: true } });
      if (taken && taken.id !== before?.id) throw new RefError("KEY_TAKEN");
      // Titre effacé : retour au texte généré (JSON null en base)
      const write = { ...data, title: data.title ?? (null as unknown as Prisma.InputJsonValue) };
      const mission = before
        ? await tx.mission.update({ where: { id: before.id }, data: write })
        : await tx.mission.create({ data: write });
      await writeAdminLog(tx, {
        adminId: g.adminId,
        action: before ? "MISSION_UPDATE" : "MISSION_CREATE",
        targetType: "Mission",
        targetId: mission.id,
        before: before ? json(before) : undefined,
        after: json(mission),
      });
      return mission.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, error: e.code };
    throw e;
  }
}

// --- Boutique ---

export async function saveShopItemAction(input: unknown): Promise<AdminEconomyResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = shopItemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const v = parsed.data;
  if (!(await prisma.lot.findUnique({ where: { id: v.lotId }, select: { id: true } }))) {
    return { ok: false, error: "UNKNOWN_REF" };
  }
  // Mise en vente : ni sachet scellé ni Mythique. Contrôlé seulement en vente (actif, prix en Zeni) :
  // désactiver un article fautif passe toujours
  if (v.active && v.priceZeni !== null) {
    const issue = await lotContentIssue(v.lotId);
    if (issue) return { ok: false, error: SHOP_ISSUE_ERROR[issue] };
  }

  const data = {
    slug: v.slug,
    name: { fr: v.name.fr, en: v.name.en },
    description: { fr: v.description.fr, en: v.description.en },
    lotId: v.lotId,
    priceZeni: v.priceZeni,
    priceCents: v.priceCents,
    stripePriceId: v.stripePriceId,
    perUserLimit: v.perUserLimit,
    limitPeriod: v.limitPeriod,
    startsAt: v.startsAt,
    endsAt: v.endsAt,
    active: v.active,
    sortOrder: v.sortOrder,
  };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const before = v.id ? await tx.shopItem.findUnique({ where: { id: v.id } }) : null;
      if (v.id && !before) throw new RefError("NOT_FOUND");
      const taken = await tx.shopItem.findUnique({ where: { slug: v.slug }, select: { id: true } });
      if (taken && taken.id !== before?.id) throw new RefError("KEY_TAKEN");
      const item = before
        ? await tx.shopItem.update({ where: { id: before.id }, data })
        : await tx.shopItem.create({ data });
      await writeAdminLog(tx, {
        adminId: g.adminId,
        action: before ? "SHOP_ITEM_UPDATE" : "SHOP_ITEM_CREATE",
        targetType: "ShopItem",
        targetId: item.id,
        before: before ? json(before) : undefined,
        after: json(item),
      });
      return item.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, error: e.code };
    throw e;
  }
}

// La révocation d'un parrainage v1 est passée dans admin-referral.ts (revokeLegacyReferralAction) : toute l'équipe.
