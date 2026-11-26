import "server-only";
import { after } from "next/server";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { ennichiPayDeps, ennichiState } from "./deps";
import { catchUpTiersWith } from "./lanterns-core";

// Branchements de l'Ennichi dans le reste du jeu : rattrapage des paliers de lanternes après l'ouverture d'un booster,
// multiplicateur du cadeau de bienvenue montré à un invité pendant la fête.

/**
 * Après la réponse à l'ouverture d'un booster : le joueur reçoit chaque palier de lanternes déjà atteint qu'il n'a pas
 * encore (il vient peut-être de devenir éligible), au plus une fois par minute.
 */
export function ennichiCatchUpLater(userId: string): void {
  after(async () => {
    try {
      const state = await ennichiState();
      // Aussi après le tirage : un joueur éligible pendant la fête qui n'a pas encore reçu un palier atteint le reçoit
      if (state.phase === "off" || !state.schedule) return;
      if (!(await prisma.ennichiTierReached.count({ where: { edition: state.rules.edition } }))) return;
      if (!(await rateLimit(`ennichi-catchup:${userId}`, { limit: 1, windowSeconds: 60 }, { store: "memory" })).success) return;
      await catchUpTiersWith(prisma, { edition: state.rules.edition, userId, schedule: state.schedule, perIp: state.rules.tierGrantsPerIp }, ennichiPayDeps());
    } catch (e) {
      console.error("[ennichi] rattrapage des lanternes impossible", e);
    }
  });
}

/** Multiplicateur du cadeau d'un ami qui arriverait maintenant (×2 pendant la fête). */
export async function ennichiInviteMultiplier(): Promise<number> {
  try {
    const state = await ennichiState();
    return state.phase === "live" ? Math.max(1, state.rules.stepMultiplier) : 1;
  } catch {
    return 1;
  }
}
