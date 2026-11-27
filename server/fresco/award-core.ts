// Fragments de fresque tombés d'une ouverture, et lots qu'ils rapportent. Appelé dans la transaction de
// l'ouverture, sous le verrou du joueur : les fragments possédés sont relus ici, le hasard est injecté
// (crypto.randomInt au serveur, graine en test). Pas de server/db.ts : le client est celui de l'ouverture.
import type { Rng } from "@/lib/boosters/rng";
import { rollFrescoDrops, type FrescoCandidate } from "@/lib/fresco/draw";
import { earnedRewards, rewardRef, type EarnedReward, type FrescoRewardKind } from "@/lib/fresco/progress";
import { grantLot, type LotDeps, type LotGrant } from "../economy/lots";
import type { Tx } from "../social/lock";

/** Fresque qui peut tomber, avec les lots choisis dans l'admin pour chaque récompense. */
export type FrescoSource = FrescoCandidate & { lots: Record<FrescoRewardKind, string | null> };

/** Ce qu'une ouverture doit savoir pour faire tomber des fragments. */
export type FrescoDropInput = {
  sources: readonly FrescoSource[];
  /** Chance par booster, en points de base (fresco.dropRate). */
  rate: number;
  rng: Rng;
  lotDeps: LotDeps;
};

/** Fragment tombé d'un booster, et les récompenses enregistrées pour lui (lot choisi, ou null). */
export type AwardedFresco = {
  frescoId: string;
  position: number;
  rewards: (EarnedReward & { lotId: string | null })[];
};

/** Lot versé pour une récompense (ref = rewardRef). */
export type FrescoGrant = { ref: string; grant: LotGrant };

/** Positions possédées par fresque. */
export async function ownedPositions(db: Pick<Tx, "userFrescoPiece">, userId: string, frescoIds: readonly string[]): Promise<Map<string, Set<number>>> {
  const out = new Map<string, Set<number>>();
  if (frescoIds.length === 0) return out;
  const rows = await db.userFrescoPiece.findMany({
    where: { userId, frescoId: { in: [...frescoIds] } },
    select: { frescoId: true, piece: { select: { position: true } } },
  });
  for (const r of rows) out.set(r.frescoId, (out.get(r.frescoId) ?? new Set()).add(r.piece.position));
  return out;
}

/**
 * Un jet par booster enregistré ; les fragments tombés sont donnés et leurs récompenses inscrites (une fois
 * par joueur, fresque, type et index : clé unique). Renvoie un élément par booster, null sans fragment.
 */
export async function awardFrescoPieces(
  tx: Tx,
  input: { userId: string; boosterTypeId: string; count: number; drop: FrescoDropInput; now: Date },
): Promise<(AwardedFresco | null)[]> {
  const { userId, drop, now } = input;
  const nothing = Array.from({ length: input.count }, () => null);
  if (input.count === 0 || drop.rate <= 0 || drop.sources.length === 0) return nothing;
  const owned = await ownedPositions(tx, userId, drop.sources.map((s) => s.id));
  const rolled = rollFrescoDrops(drop.rng, { count: input.count, rate: drop.rate, boosterTypeId: input.boosterTypeId, candidates: drop.sources, owned });
  const hits = rolled.flatMap((d) => (d ? [d] : []));
  if (hits.length === 0) return nothing;

  const pieces = await tx.frescoPiece.findMany({
    where: { OR: hits.map((d) => ({ frescoId: d.frescoId, position: d.position })) },
    select: { id: true, frescoId: true, position: true },
  });
  const pieceOf = new Map(pieces.map((p) => [`${p.frescoId}:${p.position}`, p.id]));
  const sourceOf = new Map(drop.sources.map((s) => [s.id, s]));
  const awarded: (AwardedFresco | null)[] = [];
  const mine = new Map([...owned].map(([id, set]) => [id, new Set(set)]));
  const rewardRows: { userId: string; frescoId: string; kind: FrescoRewardKind; index: number; lotId: string | null; grantedAt: Date }[] = [];
  const pieceRows: { userId: string; pieceId: string; frescoId: string; obtainedAt: Date }[] = [];
  for (const d of rolled) {
    const pieceId = d ? pieceOf.get(`${d.frescoId}:${d.position}`) : undefined;
    const source = d ? sourceOf.get(d.frescoId) : undefined;
    if (!d || !pieceId || !source) {
      awarded.push(null);
      continue;
    }
    const before = mine.get(d.frescoId) ?? new Set<number>();
    const earned = earnedRewards(before, [d.position], source.grid);
    before.add(d.position);
    mine.set(d.frescoId, before);
    pieceRows.push({ userId, pieceId, frescoId: d.frescoId, obtainedAt: now });
    const rewards = earned.map((r) => ({ ...r, lotId: source.lots[r.kind] }));
    for (const r of rewards) rewardRows.push({ userId, frescoId: d.frescoId, kind: r.kind, index: r.index, lotId: r.lotId, grantedAt: now });
    awarded.push({ frescoId: d.frescoId, position: d.position, rewards });
  }
  if (pieceRows.length === 0) return nothing;
  await tx.userFrescoPiece.createMany({ data: pieceRows, skipDuplicates: true });
  // Récompense déjà inscrite (course impossible sous le verrou, mais la clé reste la seule garantie) : retirée
  const inserted = rewardRows.length > 0 ? await tx.frescoReward.createManyAndReturn({ data: rewardRows, skipDuplicates: true, select: { frescoId: true, kind: true, index: true } }) : [];
  const fresh = new Set(inserted.map((r) => `${r.frescoId}:${r.kind}:${r.index}`));
  return awarded.map((a) => (a ? { ...a, rewards: a.rewards.filter((r) => fresh.has(rewardRef(a.frescoId, r))) } : null));
}

/**
 * Verse les lots des récompenses inscrites, après le débit des boosters (les Zeni d'un lot ne paient pas
 * l'ouverture). Une ligne CoinTransaction FRESCO par lot qui contient des Zeni.
 */
export async function grantFrescoLots(tx: Tx, userId: string, awarded: readonly (AwardedFresco | null)[], deps: LotDeps, now: Date): Promise<FrescoGrant[]> {
  const out: FrescoGrant[] = [];
  for (const a of awarded) {
    if (!a) continue;
    for (const r of a.rewards) {
      if (!r.lotId) continue;
      const ref = rewardRef(a.frescoId, r);
      out.push({ ref, grant: await grantLot(tx, userId, r.lotId, { reason: "FRESCO", refId: ref }, deps, now) });
    }
  }
  return out;
}

/** Solde après les lots versés (le dernier lot avec des Zeni), sinon `coins`. */
export function coinsAfter(grants: readonly FrescoGrant[], coins: number): number {
  return grants.reduce((c, g) => g.grant.coins ?? c, coins);
}
