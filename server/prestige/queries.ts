import "server-only";
import { contentsLabel } from "@/lib/boosters/catalog";
import { effectiveSlotFloors, isRewardableKind, localize } from "@/lib/boosters/types";
import type { CardView } from "@/lib/boosters/view";
import { SPECIAL_COPY } from "@/lib/collection/copies";
import type { RebirthBoosterView } from "@/lib/prestige/cinematic";
import type { Eligibility } from "@/lib/prestige/eligibility";
import { nextRebirthAt } from "@/lib/prestige/rules";
import { cardViews } from "../boosters/display";
import { getBoosterTypeEntry } from "../boosters/pools";
import { getBoosterRules } from "../boosters/rules";
import { getCatalogStats } from "../catalog/queries";
import { getRarities } from "../catalog/rarities";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { busyWith, eligibilityWith, type RebirthBooster, type RebirthCtx } from "./prestige-core";
import { getPrestigeRules, getPrintingRules } from "./rules";

// Lectures du prestige : page /prestige (accès, blocages, héritières possibles), cycles d'un joueur.

/** Contexte d'une renaissance : heure, réglages, valeurs de recyclage, ordre du registre des raretés, boosters offerts. */
export async function rebirthCtx(now = new Date()): Promise<RebirthCtx> {
  const [rules, values, rarityOrder, slug, count] = await Promise.all([
    getPrestigeRules(),
    getSetting("collection.recycleValues"),
    getRarities(),
    getSetting("prestige.rebirthBoosterSlug"),
    getSetting("prestige.rebirthBoosters"),
  ]);
  return { now, rules, values, rarityOrder, booster: { slug, count } };
}

/**
 * Booster offert, pour l'affichage (récapitulatif, rites, banc de l'admin) : null si rien n'est offert ou si le type
 * est introuvable ou scellé (la renaissance ne le crédite pas non plus, prestige-core.ts).
 */
export async function rebirthBoosterView(booster: RebirthBooster | null, locale: string): Promise<RebirthBoosterView | null> {
  if (!booster || booster.count < 1) return null;
  const [entry, rules] = await Promise.all([getBoosterTypeEntry(booster.slug), getBoosterRules()]);
  if (!entry || !isRewardableKind(entry.type.kind)) return null;
  const { type } = entry;
  return {
    slug: type.slug,
    name: localize(type.name, locale),
    count: booster.count,
    shape: type.shape,
    theme: type.theme,
    emblem: type.emblem,
    contents: contentsLabel(effectiveSlotFloors(type.slotFloors, rules.draw.slotFloors).length),
  };
}

/** Les éditions gravées tombent-elles déjà à ce prestige ? (box « gravées » de la cinématique) */
export async function printingsUnlockedAt(prestige: number): Promise<boolean> {
  const rules = await getPrintingRules();
  return rules !== null && prestige >= rules.minPrestige;
}

/** Un élément qui bloque la renaissance, avec où aller le régler. */
export type Blocker = { kind: "AUCTION" | "BATTLE" | "EXPEDITION" | "CASINO" | "LISTINGS" | "OFFERS" | "TRADES"; count: number; href: string };

export type SpecialCopyView = { userCardId: string; card: CardView; heritage: number; printing: number | null; serial: number | null };

export type CycleView = { number: number; globalRank: number; uniqueCards: number; zeni: number; createdAt: Date };

export type PrestigeOverview = {
  prestige: number;
  eligibility: Eligibility;
  blockers: Blocker[];
  /** Exemplaires dans la collection (garde de taille prestige.maxCopies). */
  copies: number;
  /** Fin du délai entre deux renaissances, ou null. */
  nextAt: Date | null;
};

const STATUS_HREF: Record<string, { kind: Blocker["kind"]; href: string }> = {
  AUCTION: { kind: "AUCTION", href: "/marche?onglet=selling" },
  BATTLE: { kind: "BATTLE", href: "/combat" },
  EXPEDITION: { kind: "EXPEDITION", href: "/expedition" },
  CASINO: { kind: "CASINO", href: "/casino/pile-ou-face?onglet=mes-tables" },
};

export async function getPrestigeOverview(userId: string, ctx: RebirthCtx): Promise<PrestigeOverview | null> {
  const [user, eligibility, busy, copies] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { prestige: true, prestigedAt: true } }),
    // Décompte du catalogue en cache : la transaction de la renaissance, elle, le relit en base
    getCatalogStats().then((catalog) => eligibilityWith(prisma, userId, ctx, catalog.byRarity)),
    busyWith(prisma, userId, ctx.now),
    prisma.userCard.count({ where: { ownerId: userId } }),
  ]);
  if (!user) return null;
  const blockers: Blocker[] = busy.copies.flatMap((c) => (STATUS_HREF[c.status] ? [{ ...STATUS_HREF[c.status], count: c.count }] : []));
  if (busy.listings > 0) blockers.push({ kind: "LISTINGS", count: busy.listings, href: "/marche?onglet=mes-echanges" });
  if (busy.offers > 0) blockers.push({ kind: "OFFERS", count: busy.offers, href: "/marche?onglet=mes-echanges" });
  if (busy.trades > 0) blockers.push({ kind: "TRADES", count: busy.trades, href: "/amis" });
  return { prestige: user.prestige, eligibility, blockers, copies, nextAt: nextRebirthAt(user.prestigedAt, ctx.rules.minDaysBetween, ctx.now) };
}

/** Exemplaires spéciaux en collection : héritières à garder en priorité (étape du choix de la renaissance). */
export async function getSpecialCopies(userId: string, locale: string): Promise<SpecialCopyView[]> {
  const rows = await prisma.userCard.findMany({
    where: { ownerId: userId, status: "COLLECTION", ...SPECIAL_COPY },
    orderBy: [{ heritage: "desc" }, { obtainedAt: "asc" }],
    take: 200,
    select: { id: true, cardId: true, heritage: true, printing: true, serial: true },
  });
  const views = await cardViews(rows.map((r) => r.cardId), locale);
  return rows.flatMap((r) => {
    const card = views.get(r.cardId);
    return card ? [{ userCardId: r.id, card, heritage: r.heritage, printing: r.printing, serial: r.serial }] : [];
  });
}

/** Dernière renaissance et record d'un joueur (profil) ; null s'il n'a jamais renaît. */
export async function getPrestigeSummary(userId: string): Promise<{ last: CycleView; bestUniqueCards: number } | null> {
  const cycles = await prisma.prestigeCycle.findMany({
    where: { userId },
    orderBy: { number: "desc" },
    select: { number: true, globalRank: true, uniqueCards: true, zeni: true, createdAt: true },
  });
  if (cycles.length === 0) return null;
  return { last: cycles[0], bestUniqueCards: Math.max(...cycles.map((c) => c.uniqueCards)) };
}
