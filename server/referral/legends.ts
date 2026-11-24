import "server-only";
import type { ReferralV2Rules } from "@/lib/referral/rules";
import { prisma } from "../db";
import { installedCount } from "./payout-core";

// Mur des légendes du parrainage v2 (maquette « Rouleau d'honneur ») : les joueurs qui ont atteint le palier qui l'inscrit
// (referral.v2.milestones, `legend`), dans l'ordre où ils l'ont atteint. Un palier repris (« Révoquer et bannir ») ou un
// compte banni n'y figure plus.

export type LegendEntry = { userId: string; name: string; installed: number; at: Date };
export type LegendWall = {
  /** Amis installés qu'il faut pour être inscrit ; null si aucun palier n'inscrit au mur. */
  threshold: number | null;
  entries: LegendEntry[];
};

const MAX_ENTRIES = 200;

export async function legendWall(rules: ReferralV2Rules): Promise<LegendWall> {
  const rung = rules.milestones.find((m) => m.legend);
  if (!rung) return { threshold: null, entries: [] };
  const rewards = await prisma.referralReward.findMany({
    where: { kind: "MILESTONE", milestone: rung.installed, clawedBackAt: null, user: { bannedAt: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_ENTRIES,
    select: { createdAt: true, user: { select: { id: true, username: true } } },
  });
  const counts = await Promise.all(rewards.map((r) => installedCount(prisma, r.user.id)));
  return {
    threshold: rung.installed,
    entries: rewards.map((r, i) => ({ userId: r.user.id, name: r.user.username, installed: counts[i], at: r.createdAt })),
  };
}
