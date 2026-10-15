import type { BoardTier } from "@/lib/battle/tiers";
import type { SettingValue } from "@/lib/settings/defaults";

// Mode classé (étape 9b) : rangs, divisions, barème des points de classement (PC), protection et
// appariement. Fonctions pures ; les valeurs viennent de GameSetting « ranked.* ».

/** Rangs à divisions, du plus bas au plus haut (Grand Champion est à part : top 100). */
export const LADDER = ["BRONZE", "SILVER", "GOLD", "EMERALD", "ELITE", "CHAMPION"] as const;
export type LadderTier = (typeof LADDER)[number];

export type TierRow = { min: number; win: number; crushWin: number; loss: number; crushLoss: number };

export type RankedRules = {
  enabled: boolean;
  tiers: SettingValue<"ranked.tiers">;
  grandChampion: SettingValue<"ranked.grandChampion">;
  gapDivisor: number;
  gapCapPct: number;
  crushHpPct: number;
  protectionGames: number;
  matchRange: SettingValue<"ranked.matchRange">;
  botPcPct: number;
  seasonMonths: number;
  reset: SettingValue<"ranked.reset">;
  rewardLots: SettingValue<"ranked.rewardLots">;
};

export const DIVISIONS = 3;

export type Rank = {
  tier: BoardTier;
  /** 3 = III (bas du rang), 1 = I ; null pour Grand Champion. */
  division: 1 | 2 | 3 | null;
  /** PC du bas de la division, et du palier suivant (null : rien au-dessus). */
  floor: number;
  next: number | null;
  /** Avancée dans la division, de 0 à 1. */
  progress: number;
};

/** Rang à divisions atteint avec `pc` PC (sans tenir compte du top 100). */
export function ladderTier(pc: number, r: Pick<RankedRules, "tiers">): LadderTier {
  let tier: LadderTier = "BRONZE";
  for (const t of LADDER) if (pc >= r.tiers[t].min) tier = t;
  return tier;
}

/** Largeur d'une division : le tiers du rang, ou celle du rang précédent pour le dernier. */
function divisionSpan(tier: LadderTier, r: Pick<RankedRules, "tiers">): number {
  const i = LADDER.indexOf(tier);
  const top = i < LADDER.length - 1 ? r.tiers[LADDER[i + 1]].min : null;
  if (top !== null) return Math.max(1, Math.floor((top - r.tiers[tier].min) / DIVISIONS));
  return i > 0 ? divisionSpan(LADDER[i - 1], r) : 100;
}

export function rankOf(pc: number, inTop: boolean, r: Pick<RankedRules, "tiers" | "grandChampion">): Rank {
  if (inTop && pc >= r.grandChampion.min) return { tier: "GRAND_CHAMPION", division: null, floor: r.grandChampion.min, next: null, progress: 1 };
  const tier = ladderTier(pc, r);
  const min = r.tiers[tier].min;
  const span = divisionSpan(tier, r);
  const division = Math.max(1, DIVISIONS - Math.floor((pc - min) / span)) as 1 | 2 | 3;
  const floor = min + (DIVISIONS - division) * span;
  const i = LADDER.indexOf(tier);
  const next = division > 1 ? floor + span : i < LADDER.length - 1 ? r.tiers[LADDER[i + 1]].min : r.grandChampion.min;
  const progress = next > floor ? Math.min(1, Math.max(0, (pc - floor) / (next - floor))) : 1;
  return { tier, division, floor, next, progress };
}

/** Barème du rang (Grand Champion compris). */
export function rowOf(rank: Rank, r: Pick<RankedRules, "tiers" | "grandChampion">): TierRow {
  return rank.tier === "GRAND_CHAMPION" ? r.grandChampion : r.tiers[rank.tier];
}

/** Écrasante : au moins crushHpPct % des PV de l'équipe gagnante restants, ou aucune carte perdue. */
export function isCrushing(winner: { hpLeft: number; hpMax: number; cardsLost: number }, crushHpPct: number): boolean {
  return winner.cardsLost === 0 || winner.hpLeft * 100 >= winner.hpMax * crushHpPct;
}

/**
 * Variation de PC d'un joueur : barème de son rang, corrigé par l'écart de niveau (adversaire plus
 * fort → gagner rapporte plus et perdre coûte moins), borné à ±gapCapPct %.
 */
export function pcDelta(
  input: { pc: number; oppPc: number; won: boolean; crushing: boolean; row: TierRow },
  r: Pick<RankedRules, "gapDivisor" | "gapCapPct">,
): number {
  const cap = r.gapCapPct / 100;
  const gap = Math.max(-cap, Math.min(cap, (input.oppPc - input.pc) / r.gapDivisor));
  if (input.won) return Math.round((input.crushing ? input.row.crushWin : input.row.win) * (1 + gap));
  return -Math.round((input.crushing ? input.row.crushLoss : input.row.loss) * (1 - gap));
}

export type Applied = {
  pc: number;
  delta: number;
  protection: number;
  promoted: boolean;
  demoted: boolean;
  /** La protection a retenu une chute sous le plancher du rang. */
  saved: boolean;
};

/**
 * Applique une variation : plancher à 0, protection après une montée de rang (pas entre divisions),
 * compteur de protection décompté à chaque partie classée.
 */
export function applyResult(
  input: { pc: number; delta: number; protection: number },
  r: Pick<RankedRules, "tiers" | "protectionGames">,
): Applied {
  const before = LADDER.indexOf(ladderTier(input.pc, r));
  let pc = Math.max(0, input.pc + input.delta);
  let saved = false;
  if (input.delta < 0 && input.protection > 0) {
    const floor = r.tiers[LADDER[before]].min;
    if (pc < floor) {
      pc = floor;
      saved = true;
    }
  }
  const after = LADDER.indexOf(ladderTier(pc, r));
  const promoted = after > before;
  return {
    pc,
    delta: pc - input.pc,
    protection: promoted ? r.protectionGames : Math.max(0, input.protection - 1),
    promoted,
    demoted: after < before,
    saved,
  };
}

/** Écart de PC accepté pour un adversaire après `waitSeconds` d'attente. */
export function matchRange(waitSeconds: number, r: Pick<RankedRules, "matchRange">): number {
  const m = r.matchRange;
  return Math.min(m.max, m.base + Math.max(0, Math.floor(waitSeconds)) * m.perSecond);
}

/** Variation contre un bot : une part seulement (botPcPct %). */
export function botDelta(delta: number, r: Pick<RankedRules, "botPcPct">): number {
  // Arrondi qui s'éloigne de zéro : gains et pertes restent symétriques (−7,5 → −8)
  return Math.sign(delta) * Math.round((Math.abs(delta) * r.botPcPct) / 100);
}

export const RANKED_SETTING_KEYS = [
  "ranked.enabled",
  "ranked.tiers",
  "ranked.grandChampion",
  "ranked.gapDivisor",
  "ranked.gapCapPct",
  "ranked.crushHpPct",
  "ranked.protectionGames",
  "ranked.matchRange",
  "ranked.botPcPct",
  "ranked.seasonMonths",
  "ranked.reset",
  "ranked.rewardLots",
] as const;

export type RankedSettingKey = (typeof RANKED_SETTING_KEYS)[number];

export function rankedRulesFrom(get: <K extends RankedSettingKey>(key: K) => SettingValue<K>): RankedRules {
  return {
    enabled: get("ranked.enabled"),
    tiers: get("ranked.tiers"),
    grandChampion: get("ranked.grandChampion"),
    gapDivisor: get("ranked.gapDivisor"),
    gapCapPct: get("ranked.gapCapPct"),
    crushHpPct: get("ranked.crushHpPct"),
    protectionGames: get("ranked.protectionGames"),
    matchRange: get("ranked.matchRange"),
    botPcPct: get("ranked.botPcPct"),
    seasonMonths: get("ranked.seasonMonths"),
    reset: get("ranked.reset"),
    rewardLots: get("ranked.rewardLots"),
  };
}
