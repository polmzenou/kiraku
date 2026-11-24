// Versement d'un lot de l'Ennichi dans la transaction de ce qui le cause (palier de lanternes, prix du banzuke, lot de
// l'omikuji) : le lot (une fois), les bons « Mythique au choix » et le bon de la carte 1/1, qui arrivent tout seuls (le
// joueur choisit ensuite sa carte sur /parrainage/bons). Renvoie ce qui a été donné, pour la reprise et le suivi.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { grantLot, type LotDeps, type LotGrant } from "../economy/lots";

type Tx = Prisma.TransactionClient;

export type EnnichiPrize = { lotId: string | null; choiceVouchers: number; oneOfOne: boolean };

/** Ce qu'un versement a donné, au format relu par la reprise du parrainage (RewardGrant) ; `paidAt` le marque versé. */
export type PrizeGrant = {
  zeni: number;
  credits: Record<string, number>;
  sealedIds: string[];
  cardIds: string[];
  voucherIds: string[];
  paidAt: string;
};

function grantedOf(grant: LotGrant | null, voucherIds: string[], now: Date): PrizeGrant {
  const credits: Record<string, number> = {};
  for (const b of grant?.boosters ?? []) if (!b.sealed) credits[b.boosterTypeId] = (credits[b.boosterTypeId] ?? 0) + b.count;
  return {
    zeni: grant?.zeni ?? 0,
    credits,
    sealedIds: grant?.sealedIds ?? [],
    cardIds: (grant?.cards ?? []).map((c) => c.userCardId),
    voucherIds,
    paidAt: now.toISOString(),
  };
}

export async function grantPrizeInTx(
  tx: Tx,
  userId: string,
  prize: EnnichiPrize,
  ledger: { refId: string },
  deps: { lotDeps: LotDeps; now: Date },
): Promise<PrizeGrant> {
  const grant = prize.lotId ? await grantLot(tx, userId, prize.lotId, { reason: "ENNICHI", refId: ledger.refId }, deps.lotDeps, deps.now) : null;
  const kinds = [
    ...Array.from({ length: Math.max(0, prize.choiceVouchers) }, () => "MYTHIC_CHOICE" as const),
    ...(prize.oneOfOne ? ["ONE_OF_ONE" as const] : []),
  ];
  const voucherIds: string[] = [];
  for (const kind of kinds) {
    const id = randomUUID();
    await tx.voucher.create({ data: { id, userId, kind, createdAt: deps.now }, select: { id: true } });
    voucherIds.push(id);
  }
  return grantedOf(grant, voucherIds, deps.now);
}

/** Lit un prix stocké (EnnichiAward.prize), à défaut rien. */
export function readPrize(raw: Prisma.JsonValue): EnnichiPrize {
  const p = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    lotId: typeof p.lotId === "string" ? p.lotId : null,
    choiceVouchers: Number.isSafeInteger(p.choiceVouchers) && (p.choiceVouchers as number) > 0 ? (p.choiceVouchers as number) : 0,
    oneOfOne: p.oneOfOne === true,
  };
}
