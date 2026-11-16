import { hashSeed } from "@/lib/boosters/rotation";
import { seededRng, type Rng } from "@/lib/rng";
import type { ExpeditionRisk } from "./types";

// Offres du jour d'un joueur : tirage à graine (joueur + jour), figé en base à la première lecture.
// La première offre est sûre, la dernière périlleuse ; paliers de rareté et durées tous différents
// tant que le catalogue le permet. L'offre sûre est prise dans un palier que le joueur peut remplir.

export type BoardCandidate = {
  id: string;
  risk: ExpeditionRisk;
  /** Palier de la rareté exigée (0 = le plus courant). */
  tier: number;
  durationMinutes: number;
  weight: number;
};

export type BoardOptions = {
  offersPerDay: number;
  /** Meilleur palier que le joueur peut envoyer (carte libre), null s'il n'a rien. */
  staffableTier: number | null;
};

/** Risque de chaque offre : sûre d'abord, périlleuse en dernier, équilibrées entre les deux. */
export function riskPlan(count: number): ExpeditionRisk[] {
  if (count <= 0) return [];
  if (count === 1) return ["BALANCED"];
  return ["SAFE", ...Array.from({ length: count - 2 }, () => "BALANCED" as const), "RISKY"];
}

/** Graine du plateau d'un joueur pour un jour donné. */
export const boardSeed = (userId: string, dayKey: string) => hashSeed(`expedition:${userId}:${dayKey}`);

function weightedPick<T extends { weight: number }>(items: readonly T[], rng: Rng): T | undefined {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return items[0];
  let x = rng(total);
  for (const item of items) {
    x -= item.weight;
    if (x < 0) return item;
  }
  return items.at(-1);
}

/** Ids des offres du jour, triées par durée. Déterministe pour une même graine et un même catalogue. */
export function generateBoard(candidates: readonly BoardCandidate[], seed: number, options: BoardOptions): string[] {
  const rng = seededRng(seed);
  const pool = candidates.filter((c) => c.weight > 0).sort((a, b) => a.id.localeCompare(b.id, "en"));
  const picked: BoardCandidate[] = [];
  const usedTiers = new Set<number>();
  const usedDurations = new Set<number>();

  for (const risk of riskPlan(options.offersPerDay)) {
    const free = pool.filter((c) => !picked.includes(c));
    const fresh = free.filter((c) => !usedTiers.has(c.tier) && !usedDurations.has(c.durationMinutes));
    const sameRisk = fresh.filter((c) => c.risk === risk);
    const tiers: BoardCandidate[][] = [];
    if (risk === "SAFE") {
      // Une offre sûre que le joueur peut remplir ; sans carte assez rare, la plus accessible
      const staffable = options.staffableTier;
      const reachable = staffable === null ? [] : sameRisk.filter((c) => c.tier <= staffable);
      const lowest = Math.min(...sameRisk.map((c) => c.tier));
      tiers.push(reachable, sameRisk.filter((c) => c.tier === lowest));
    }
    tiers.push(sameRisk, fresh, free.filter((c) => !usedDurations.has(c.durationMinutes)), free);
    const choice = weightedPick(tiers.find((list) => list.length > 0) ?? [], rng);
    if (!choice) break;
    picked.push(choice);
    usedTiers.add(choice.tier);
    usedDurations.add(choice.durationMinutes);
  }

  return picked
    .sort((a, b) => a.durationMinutes - b.durationMinutes || a.tier - b.tier || a.id.localeCompare(b.id, "en"))
    .map((c) => c.id);
}
