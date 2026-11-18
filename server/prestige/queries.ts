import "server-only";
import type { CardView } from "@/lib/boosters/view";
import type { Eligibility } from "@/lib/prestige/eligibility";
import { nextRebirthAt, type PrestigeRules } from "@/lib/prestige/rules";
import { cardViews } from "../boosters/display";
import { getRarities } from "../catalog/rarities";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { busyWith, eligibilityWith, isBusy, type RebirthCtx } from "./prestige-core";
import { getPrestigeRules } from "./rules";

// Lectures du prestige : page /prestige (accès, blocages, héritières possibles), cycles d'un joueur.

/** Contexte d'une renaissance : heure, réglages, valeurs de recyclage, ordre du registre des raretés. */
export async function rebirthCtx(now = new Date()): Promise<RebirthCtx> {
  const [rules, values, rarityOrder] = await Promise.all([getPrestigeRules(), getSetting("collection.recycleValues"), getRarities()]);
  return { now, rules, values, rarityOrder };
}

/** Un élément qui bloque la renaissance, avec où aller le régler. */
export type Blocker = { kind: "AUCTION" | "BATTLE" | "EXPEDITION" | "CASINO" | "LISTINGS" | "OFFERS" | "TRADES"; count: number; href: string };

export type SpecialCopyView = { userCardId: string; card: CardView; heritage: number; printing: number | null; serial: number | null };

export type CycleView = { number: number; globalRank: number; uniqueCards: number; zeni: number; createdAt: Date };

export type PrestigeOverview = {
  rules: PrestigeRules;
  prestige: number;
  eligibility: Eligibility;
  blockers: Blocker[];
  /** Exemplaires dans la collection (garde de taille prestige.maxCopies). */
  copies: number;
  /** Fin du délai entre deux renaissances, ou null. */
  nextAt: Date | null;
  /** Exemplaires spéciaux en collection : héritières à garder en priorité. */
  special: SpecialCopyView[];
  cycles: CycleView[];
};

const STATUS_HREF: Record<string, { kind: Blocker["kind"]; href: string }> = {
  AUCTION: { kind: "AUCTION", href: "/marche?onglet=selling" },
  BATTLE: { kind: "BATTLE", href: "/combat" },
  EXPEDITION: { kind: "EXPEDITION", href: "/expedition" },
  CASINO: { kind: "CASINO", href: "/casino/pile-ou-face?onglet=mes-tables" },
};

export async function getPrestigeOverview(userId: string, locale: string, ctx: RebirthCtx): Promise<PrestigeOverview | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { prestige: true, prestigedAt: true } });
  if (!user) return null;
  const [eligibility, busy, copies, specialRows, cycles] = await Promise.all([
    eligibilityWith(prisma, userId, ctx),
    busyWith(prisma, userId, ctx.now),
    prisma.userCard.count({ where: { ownerId: userId } }),
    prisma.userCard.findMany({
      where: { ownerId: userId, status: "COLLECTION", OR: [{ heritage: { gt: 0 } }, { printing: { not: null } }] },
      orderBy: [{ heritage: "desc" }, { obtainedAt: "asc" }],
      take: 200,
      select: { id: true, cardId: true, heritage: true, printing: true, serial: true },
    }),
    prisma.prestigeCycle.findMany({
      where: { userId },
      orderBy: { number: "desc" },
      select: { number: true, globalRank: true, uniqueCards: true, zeni: true, createdAt: true },
    }),
  ]);
  const blockers: Blocker[] = busy.copies.flatMap((c) => (STATUS_HREF[c.status] ? [{ ...STATUS_HREF[c.status], count: c.count }] : []));
  if (busy.listings > 0) blockers.push({ kind: "LISTINGS", count: busy.listings, href: "/marche?onglet=mes-echanges" });
  if (busy.offers > 0) blockers.push({ kind: "OFFERS", count: busy.offers, href: "/marche?onglet=mes-echanges" });
  if (busy.trades > 0) blockers.push({ kind: "TRADES", count: busy.trades, href: "/amis" });
  const views = await cardViews(specialRows.map((r) => r.cardId), locale);
  return {
    rules: ctx.rules,
    prestige: user.prestige,
    eligibility,
    blockers: isBusy(busy) ? blockers : [],
    copies,
    nextAt: nextRebirthAt(user.prestigedAt, ctx.rules.minDaysBetween, ctx.now),
    special: specialRows.flatMap((r) => {
      const card = views.get(r.cardId);
      return card ? [{ userCardId: r.id, card, heritage: r.heritage, printing: r.printing, serial: r.serial }] : [];
    }),
    cycles,
  };
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
