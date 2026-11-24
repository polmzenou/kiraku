import type { SettingValue } from "@/lib/settings/defaults";

// Règles de l'Ennichi 縁日 (étape 18d), lues dans les réglages ennichi.* : calendrier, phase, lanternes et banzuke.
// Pur : le serveur fournit les réglages, l'heure et les comptes ; les écrans et les cœurs en partagent le calcul.

export const ENNICHI_SETTING_KEYS = [
  "ennichi.enabled",
  "ennichi.edition",
  "ennichi.startsAt",
  "ennichi.days",
  "ennichi.closingDays",
  "ennichi.stepMultiplier",
  "ennichi.liftCap",
  "ennichi.tiers",
  "ennichi.ranks",
  "ennichi.omikuji",
  "ennichi.tierGrantsPerIp",
] as const;

export type EnnichiTier = SettingValue<"ennichi.tiers">[number];
export type EnnichiRank = SettingValue<"ennichi.ranks">[number];
export type EnnichiPrize = SettingValue<"ennichi.omikuji">[number];
export type EnnichiTitle = NonNullable<EnnichiRank["title"]>;

export type EnnichiRules = {
  enabled: boolean;
  edition: number;
  startsAt: Date | null;
  days: number;
  closingDays: number;
  stepMultiplier: number;
  liftCap: boolean;
  tiers: readonly EnnichiTier[];
  ranks: readonly EnnichiRank[];
  omikuji: readonly EnnichiPrize[];
  tierGrantsPerIp: number;
};

type EnnichiSettings = { [K in (typeof ENNICHI_SETTING_KEYS)[number]]: SettingValue<K> };

export function ennichiRulesFrom(s: EnnichiSettings): EnnichiRules {
  const startsAt = s["ennichi.startsAt"] ? new Date(s["ennichi.startsAt"]) : null;
  return {
    enabled: s["ennichi.enabled"],
    edition: s["ennichi.edition"],
    startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
    days: s["ennichi.days"],
    closingDays: s["ennichi.closingDays"],
    stepMultiplier: s["ennichi.stepMultiplier"],
    liftCap: s["ennichi.liftCap"],
    tiers: s["ennichi.tiers"],
    ranks: s["ennichi.ranks"],
    omikuji: s["ennichi.omikuji"],
    tierGrantsPerIp: s["ennichi.tierGrantsPerIp"],
  };
}

const DAY = 86_400_000;

export type EnnichiSchedule = { startsAt: Date; endsAt: Date; closesAt: Date };

/** Dates de la fête : début réglé, fin `days` jours après, clôture (tirage) `closingDays` jours plus tard. */
export function ennichiSchedule(rules: Pick<EnnichiRules, "startsAt" | "days" | "closingDays">): EnnichiSchedule | null {
  if (!rules.startsAt) return null;
  const endsAt = new Date(rules.startsAt.getTime() + rules.days * DAY);
  return { startsAt: rules.startsAt, endsAt, closesAt: new Date(endsAt.getTime() + rules.closingDays * DAY) };
}

/**
 * off : coupée ou sans date ; before : annoncée ; live : la fête (les amis qui arrivent comptent, ×2) ; closing : les
 * jours de clôture, les lanternes s'allument encore et l'équipe tranche les cas « À vérifier » ; closed : tirage fait.
 * Après la date de clôture, la phase reste « closing » jusqu'au tirage (l'équipe ou le cron de secours le lance).
 */
export type EnnichiPhase = "off" | "before" | "live" | "closing" | "closed";

export function ennichiPhase(rules: Pick<EnnichiRules, "enabled" | "startsAt" | "days" | "closingDays">, now: Date, drawnAt: Date | null): EnnichiPhase {
  const schedule = ennichiSchedule(rules);
  if (!rules.enabled || !schedule) return "off";
  if (drawnAt) return "closed";
  if (now < schedule.startsAt) return "before";
  if (now < schedule.endsAt) return "live";
  return "closing";
}

/** Un ami qui se rattache à cet instant arrive-t-il pendant la fête (bonus, lanterne, banzuke, omikuji) ? */
export function arrivesDuringFete(rules: Pick<EnnichiRules, "enabled" | "startsAt" | "days" | "closingDays">, now: Date, drawnAt: Date | null): boolean {
  return ennichiPhase(rules, now, drawnAt) === "live";
}

/* ---------------- Lanternes ---------------- */

/** Index du prochain palier de lanternes (le premier pas encore atteint), ou null s'ils le sont tous. */
export function nextTierIndex(lit: number, tiers: readonly { lanterns: number }[], reached: readonly boolean[] = []): number | null {
  const i = tiers.findIndex((t, k) => !reached[k] && lit < t.lanterns);
  return i >= 0 ? i : null;
}

/** Paliers que ce nombre de lanternes allumées atteint (indices, dans l'ordre). */
export function tiersReachedBy(lit: number, tiers: readonly { lanterns: number }[]): number[] {
  return tiers.flatMap((t, i) => (lit >= t.lanterns ? [i] : []));
}

/** Avancement vers le prochain palier, de 0 à 100 (depuis le palier précédent). */
export function tierProgress(lit: number, tiers: readonly { lanterns: number }[], next: number | null): number {
  if (next === null) return 100;
  const from = next > 0 ? tiers[next - 1].lanterns : 0;
  const span = Math.max(1, tiers[next].lanterns - from);
  return Math.max(0, Math.min(100, Math.round(((lit - from) / span) * 100)));
}

/** Lanternes allumées de la rue dessinée (`total` places), en proportion du dernier palier ; au moins une dès la première. */
export function streetLampsLit(lit: number, tiers: readonly { lanterns: number }[], total: number): number {
  const max = tiers.length ? tiers[tiers.length - 1].lanterns : 1;
  if (lit <= 0) return 0;
  return Math.max(1, Math.min(total, Math.round((lit / Math.max(1, max)) * total)));
}

/* ---------------- Banzuke ---------------- */

export type Recruiter = { userId: string; count: number; /** Installation qui l'a mené à ce compte. */ reachedAt: Date };
export type RankedRecruiter<T extends Recruiter = Recruiter> = T & { rank: number };

/**
 * Classement des recruteurs : le plus d'amis arrivés pendant la fête et installés ; à égalité, celui qui a atteint son
 * nombre le premier passe devant (puis l'id, pour un ordre stable). Pas de rang partagé.
 */
export function rankRecruiters<T extends Recruiter>(rows: readonly T[]): RankedRecruiter<T>[] {
  return rows
    .filter((r) => r.count > 0)
    .slice()
    .sort((a, b) => b.count - a.count || a.reachedAt.getTime() - b.reachedAt.getTime() || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Rang du banzuke → sa ligne de lots (titre, lot, bons, 1/1), ou null hors des lots. */
export function rankBand<R extends { from: number; to: number }>(rank: number, ranks: readonly R[]): R | null {
  return ranks.find((b) => rank >= b.from && rank <= b.to) ?? null;
}

/** Dernier rang qui gagne un lot. */
export const lastPaidRank = (ranks: readonly { to: number }[]) => Math.max(0, ...ranks.map((r) => r.to));
