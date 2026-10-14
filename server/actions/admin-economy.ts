"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { lotInputSchema } from "@/lib/economy/lots";
import { missionInputSchema } from "@/lib/economy/missions";
import { shopItemInputSchema } from "@/lib/economy/shop";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";

// Lots, missions, articles de boutique et parrainages depuis /admin. Ordre : rôle admin → Zod →
// rate limit → références vérifiées → transaction avec une ligne AdminLog (avant / après).
// Chaque champ écrit est choisi un par un, jamais l'objet reçu.

export type AdminEconomyError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "KEY_TAKEN" | "UNKNOWN_REF";

export type AdminEconomyResult = { ok: true; id: string } | { ok: false; error: AdminEconomyError };

async function guard(): Promise<{ adminId: string } | { error: "FORBIDDEN" | "RATE_LIMITED" }> {
  const admin = await getAdmin();
  if (!admin) return { error: "FORBIDDEN" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { error: "RATE_LIMITED" };
  return { adminId: admin.id };
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

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
  const typeIds = [...new Set(v.items.flatMap((i) => (i.kind === "BOOSTER" ? [i.boosterTypeId] : [])))];
  const cardIds = [...new Set(v.items.flatMap((i) => (i.kind === "CARD" ? [i.cardId] : [])))];
  const [types, cards] = await Promise.all([
    typeIds.length ? prisma.boosterType.count({ where: { id: { in: typeIds } } }) : 0,
    cardIds.length ? prisma.card.count({ where: { id: { in: cardIds } } }) : 0,
  ]);
  if (types !== typeIds.length || cards !== cardIds.length) return { ok: false, error: "UNKNOWN_REF" };

  const items = v.items.map((i) => ({
    kind: i.kind,
    boosterTypeId: i.kind === "BOOSTER" ? i.boosterTypeId : null,
    cardId: i.kind === "CARD" ? i.cardId : null,
    rarity: i.kind === "RARITY_CARD" ? i.rarity : null,
    quantity: i.quantity,
  }));
  const data = { name: { fr: v.name.fr, en: v.name.en }, zeni: v.zeni, active: v.active };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const before = v.id ? await tx.lot.findUnique({ where: { id: v.id }, include: { items: true } }) : null;
      if (v.id && !before) throw new RefError("NOT_FOUND");
      const lot = before
        ? await tx.lot.update({ where: { id: before.id }, data })
        : await tx.lot.create({ data });
      // Le contenu est remplacé d'un bloc : un lot déjà versé ne change rien à ce qui a été reçu
      await tx.lotItem.deleteMany({ where: { lotId: lot.id } });
      if (items.length) await tx.lotItem.createMany({ data: items.map((i) => ({ ...i, lotId: lot.id })) });
      await tx.adminLog.create({
        data: {
          adminId: g.adminId,
          action: before ? "LOT_UPDATE" : "LOT_CREATE",
          targetType: "Lot",
          targetId: lot.id,
          before: before ? json(before) : undefined,
          after: json({ ...data, items }),
        },
      });
      return lot.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof RefError) return { ok: false, error: e.code };
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
      await tx.adminLog.create({
        data: {
          adminId: g.adminId,
          action: before ? "MISSION_UPDATE" : "MISSION_CREATE",
          targetType: "Mission",
          targetId: mission.id,
          before: before ? json(before) : undefined,
          after: json(mission),
        },
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
      await tx.adminLog.create({
        data: {
          adminId: g.adminId,
          action: before ? "SHOP_ITEM_UPDATE" : "SHOP_ITEM_CREATE",
          targetType: "ShopItem",
          targetId: item.id,
          before: before ? json(before) : undefined,
          after: json(item),
        },
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

// --- Parrainage ---

const revokeSchema = z.object({ referralId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }).strict();

/** Révoque un parrainage (fraude) : plus aucune récompense ne peut être réclamée ; ce qui l'a déjà été reste. */
export async function revokeReferralAction(input: unknown): Promise<AdminEconomyResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const { referralId } = parsed.data;

  const done = await prisma.$transaction(async (tx) => {
    const before = await tx.referral.findUnique({ where: { id: referralId } });
    if (!before || before.status === "REVOKED") return false;
    await tx.referral.update({ where: { id: referralId }, data: { status: "REVOKED" } });
    await tx.adminLog.create({
      data: {
        adminId: g.adminId,
        action: "REFERRAL_REVOKE",
        targetType: "Referral",
        targetId: referralId,
        before: json(before),
        after: { status: "REVOKED" },
      },
    });
    return true;
  });
  if (!done) return { ok: false, error: "NOT_FOUND" };
  refresh();
  return { ok: true, id: referralId };
}
