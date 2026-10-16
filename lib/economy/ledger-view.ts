import { z } from "@/lib/zod";

// Historique des Zeni (/compte/historique) : filtres et liens vers la source de chaque ligne.

export const COIN_REASONS = [
  "SIGNUP",
  "BID_HOLD",
  "BID_REFUND",
  "SALE",
  "FEE",
  "DISSOLVE",
  "BATTLE_WIN",
  "DAILY",
  "MISSION",
  "REFERRAL",
  "ADMIN",
  "SHOP",
  "DISCORD_LINK",
  "BOOSTER",
  "GIFT",
  "SEASON",
] as const;
export type CoinReason = (typeof COIN_REASONS)[number];

export const LEDGER_FILTERS = ["all", "in", "out"] as const;
export type LedgerFilter = (typeof LEDGER_FILTERS)[number] | CoinReason;

export const ledgerFilterSchema = z.union([z.enum(LEDGER_FILTERS), z.enum(COIN_REASONS)]);

export function parseLedgerFilter(raw: unknown): LedgerFilter {
  const parsed = ledgerFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : "all";
}

/** Condition Prisma d'un filtre (sans l'utilisateur). */
export function ledgerWhere(filter: LedgerFilter): { amount?: { gt: number } | { lt: number }; reason?: CoinReason } {
  if (filter === "all") return {};
  if (filter === "in") return { amount: { gt: 0 } };
  if (filter === "out") return { amount: { lt: 0 } };
  return { reason: filter };
}

/** Lien (sans préfixe de langue) vers ce qui a causé la ligne, s'il existe. */
export function ledgerHref(reason: CoinReason, refId: string | null): string | null {
  switch (reason) {
    case "BOOSTER":
      return refId ? `/tirage/${refId}` : null;
    case "MISSION":
      return "/missions";
    case "REFERRAL":
      return "/parrainage";
    case "SHOP":
      return "/boutique";
    case "GIFT":
      return "/amis";
    case "DISSOLVE":
      return "/collection";
    case "BATTLE_WIN":
      return refId ? `/combat/${refId}` : "/combat";
    case "SEASON":
      return "/combat";
    default:
      return null;
  }
}

export const LEDGER_PAGE = 30;
