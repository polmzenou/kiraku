// Jauge communautaire de l'accueil : phase de l'event et progression, sans base ni horloge cachée.

export type EventGaugePhase = "upcoming" | "live" | "ended";

export type EventGaugeView = {
  phase: EventGaugePhase;
  /** Boosters comptés ; peut dépasser l'objectif, la barre reste alors pleine. */
  count: number;
  goal: number;
  /** Remplissage de la barre, de 0 à 1. */
  ratio: number;
  /** Pourcentage arrondi à l'inférieur : jamais 100 % avant d'avoir atteint l'objectif. */
  percent: number;
  reached: boolean;
  startsAt: number;
  endsAt: number;
};

/** Fenêtre `[startsAt, endsAt[` ; null si les dates ne forment pas une fenêtre (pas de jauge). */
export function eventGaugePhase(startsAt: number, endsAt: number, now: number): EventGaugePhase | null {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  if (now < startsAt) return "upcoming";
  return now < endsAt ? "live" : "ended";
}

export function eventGaugeView(input: { startsAt: number; endsAt: number; goal: number; count: number }, now: number): EventGaugeView | null {
  const { startsAt, endsAt, goal, count } = input;
  const phase = eventGaugePhase(startsAt, endsAt, now);
  if (!phase || goal <= 0) return null;
  const reached = count >= goal;
  return {
    phase,
    count,
    goal,
    ratio: Math.min(1, Math.max(0, count / goal)),
    percent: reached ? 100 : Math.floor((Math.max(0, count) * 100) / goal),
    reached,
    startsAt,
    endsAt,
  };
}
