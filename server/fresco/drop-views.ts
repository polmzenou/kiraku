import "server-only";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { OpenedCardView } from "@/lib/boosters/view";
import { rewardRef } from "@/lib/fresco/progress";
import type { FrescoDropView, FrescoView } from "@/lib/fresco/view";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import type { AwardedFresco, FrescoGrant } from "./award-core";
import { playerFrescoes } from "./queries";

/**
 * Vues des fragments tombés pendant une ouverture, booster par booster : chaque fragment montre la fresque
 * telle qu'elle était juste après lui (les fragments tombés plus loin dans la série n'y sont pas encore),
 * avec les lots versés et leurs cartes à révéler. Lu après la transaction de l'ouverture.
 */
export async function frescoDropViews(
  userId: string,
  awarded: readonly (AwardedFresco | null | undefined)[],
  grants: readonly FrescoGrant[],
  locale: string,
): Promise<(FrescoDropView<OpenedCardView> | null)[]> {
  const hits = awarded.flatMap((a) => (a ? [a] : []));
  if (hits.length === 0) return awarded.map(() => null);
  const lotIds = [...new Set(hits.flatMap((a) => a.rewards.flatMap((r) => (r.lotId ? [r.lotId] : []))))];
  const grantByRef = new Map(grants.map((g) => [g.ref, g.grant]));
  const [frescoes, lots, cards] = await Promise.all([
    playerFrescoes(userId, locale, [...new Set(hits.map((a) => a.frescoId))]),
    lotIds.length ? prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, name: true } }) : [],
    cardViews(grants.flatMap((g) => g.grant.cards.map((c) => c.cardId)), locale),
  ]);
  const frescoById = new Map(frescoes.map((f) => [f.id, f]));
  const lotName = new Map(lots.map((l) => [l.id, localize(parseLocalized(l.name), locale)]));

  return awarded.map((a, i) => {
    const final = a ? frescoById.get(a.frescoId) : undefined;
    if (!a || !final) return null;
    // Fragments de cette fresque tombés plus loin dans la série : pas encore là à ce moment-là
    const later = new Set(awarded.slice(i + 1).flatMap((b) => (b && b.frescoId === a.frescoId ? [b.position] : [])));
    const fresco: FrescoView = later.size === 0 ? final : { ...final, pieces: final.pieces.filter((p) => !later.has(p.position)), fullImageUrl: null };
    return {
      fresco,
      position: a.position,
      rewards: a.rewards.map((r) => {
        const grant = grantByRef.get(rewardRef(a.frescoId, r));
        return {
          kind: r.kind,
          index: r.index,
          lotName: r.lotId ? (lotName.get(r.lotId) ?? null) : null,
          reward: grant
            ? {
                zeni: grant.zeni,
                boosters: grant.boosters.reduce((s, b) => s + b.count, 0),
                cards: grant.cards.flatMap((c) => {
                  const view = cards.get(c.cardId);
                  return view ? [{ ...view, userCardId: c.userCardId, isNew: c.isNew, wished: c.wished, featured: false }] : [];
                }),
              }
            : null,
        };
      }),
    };
  });
}
