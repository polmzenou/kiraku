// Bons du parrainage et de l'Ennichi : « Mythique au choix » et carte 1/1. Le bon arrive tout seul ; le joueur choisit
// ensuite sa carte et le serveur la verse dans la même transaction (server/referral/voucher-core.ts). Logique pure.
import { fudaCopyOf, ONE_OF_ONE_PRINTING } from "@/lib/prestige/printing";

/** Ce qu'une fuda 1/1 montre : numéro 1 sur 1 du tirage réservé, sceau 唯. */
export const ONE_OF_ONE_COPY = fudaCopyOf({ heritage: 0, printing: ONE_OF_ONE_PRINTING, serial: 1, size: 1 }, {});

export const VOUCHER_KINDS = ["MYTHIC_CHOICE", "ONE_OF_ONE"] as const;
export type VoucherKindKey = (typeof VOUCHER_KINDS)[number];

/** Filtres de la grille : toutes, libres (1/1 pas encore prise) ou pas encore à moi (Mythique), mes séries. */
export const VOUCHER_FILTERS = ["all", "free", "series"] as const;
export type VoucherFilter = (typeof VOUCHER_FILTERS)[number];

export const VOUCHER_PAGE_SIZE = 48;
/** Rareté qu'un bon « Mythique au choix » peut prendre. */
export const VOUCHER_MYTHIC = "MYTHIC";

export type VoucherProblem = "CARD_UNAVAILABLE" | "NOT_MYTHIC";

/** Ce qui empêche de prendre cette carte avec ce bon ; null si elle convient (la 1/1 déjà prise se voit sous verrou). */
export function voucherCardProblem(kind: VoucherKindKey, card: { status: string; rarity: string } | null): VoucherProblem | null {
  if (!card || card.status !== "PUBLISHED") return "CARD_UNAVAILABLE";
  if (kind === "MYTHIC_CHOICE" && card.rarity !== VOUCHER_MYTHIC) return "NOT_MYTHIC";
  return null;
}

export type VoucherGroup = { kind: VoucherKindKey; count: number; /** Le plus ancien : c'est lui que le choix utilise. */ voucherId: string };

/** Bons à utiliser regroupés par type, Mythique au choix d'abord. */
export function voucherGroups(vouchers: readonly { id: string; kind: VoucherKindKey; createdAt: Date }[]): VoucherGroup[] {
  return VOUCHER_KINDS.flatMap((kind) => {
    const mine = vouchers
      .filter((v) => v.kind === kind)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return mine.length > 0 ? [{ kind, count: mine.length, voucherId: mine[0].id }] : [];
  });
}

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Type de bon demandé dans l'adresse (?bon=one|mythic), à défaut le premier disponible ; null sans bon. */
export function pickVoucherGroup(groups: readonly VoucherGroup[], wanted: unknown): VoucherGroup | null {
  const raw = first(wanted);
  const kind = raw === "one" ? "ONE_OF_ONE" : raw === "mythic" ? "MYTHIC_CHOICE" : null;
  return groups.find((g) => g.kind === kind) ?? groups[0] ?? null;
}

/** Valeur de ?bon= pour un type de bon. */
export const voucherParam = (kind: VoucherKindKey) => (kind === "ONE_OF_ONE" ? "one" : "mythic");

/** Filtre lu dans l'adresse ou envoyé par la grille ; « toutes » par défaut. */
export function parseVoucherFilter(raw: unknown): VoucherFilter {
  const v = first(raw);
  return (VOUCHER_FILTERS as readonly unknown[]).includes(v) ? (v as VoucherFilter) : "all";
}

/** Paliers du parrainage qui donnent un bon (pour dire au joueur sans bon où en trouver). */
export function voucherMilestones(milestones: readonly { installed: number; choiceVouchers: number; oneOfOne: boolean }[]): number[] {
  return milestones.filter((m) => m.choiceVouchers > 0 || m.oneOfOne).map((m) => m.installed);
}
