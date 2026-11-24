import { dayKey, filterContext } from "@/lib/boosters/pool-filter";
import { addDays, localMidnight, type YMD } from "@/lib/economy/period";
import type { ReferralV2Rules } from "./rules";

// Étapes du filleul (parrainage v2) : 1 Arrivée, 2 Installé, 3 Accro, 4 Fidèle. Chaque étape est un horodatage posé une
// seule fois (Referral.step1At…step4At) ; ce module dit, à partir des faits lus en base, quand chacune est atteinte, et
// ce que voit le joueur (atteinte, prochaine, verrouillée, manquée, en vérification).
//   - Étape 1 : compte inscrit et vérifié (e-mail vérifié ou Discord lié), parrain rattaché.
//   - Étape 2 : installHours après le rattachement, et installOpenings boosters ouverts hors cadeau (réserve gratuite ou
//     achetés), comptés depuis le rattachement moins guestGraceHours (le premier booster ouvert en invité compte).
//   - Étapes 3 et 4 : accroDays jours actifs dans les accroWindowDays premiers jours, fideleDays dans les fideleWindowDays
//     premiers (jour du rattachement compris, fuseau du jeu) ; un jour actif = au moins un booster ouvert, cadeaux
//     compris. Elles exigent l'étape 2 et ne se rattrapent pas après leur fenêtre ; l'étape 4 peut tomber après une
//     étape 3 manquée.

export type StepRules = Pick<
  ReferralV2Rules,
  "installHours" | "installOpenings" | "guestGraceHours" | "accroDays" | "accroWindowDays" | "fideleDays" | "fideleWindowDays"
>;

/** Origine d'une ouverture de booster (BoosterOpening.source). */
export type OpeningSource = "FREE" | "PAID" | "CREDIT" | "SEALED";

/** Ouvertures qui comptent pour l'étape 2 : la réserve gratuite et les boosters achetés, jamais un cadeau. */
export const INSTALL_OPENING_SOURCES: readonly OpeningSource[] = ["FREE", "PAID"];

export const STEP_COUNT = 4;
export type StepTimes = readonly [Date | null, Date | null, Date | null, Date | null];
export const NO_STEPS: StepTimes = [null, null, null, null];

/** Un jour actif : sa clé dans le fuseau du jeu (« 2026-11-24 ») et la première ouverture de ce jour. */
export type ActiveDay = { day: string; firstAt: Date };

export type RefereeFacts = {
  referredAt: Date;
  registeredAt: Date | null;
  /** Première vérification (e-mail vérifié ou Discord lié), null tant qu'il n'y en a pas. */
  verifiedAt: Date | null;
  /** Ouvertures hors cadeau depuis installCountFrom(), et l'instant de la installOpenings-ième (null s'il en manque). */
  installOpenings: number;
  installOpeningAt: Date | null;
  /** Jours actifs depuis le jour du rattachement, toutes ouvertures comprises. */
  activeDays: readonly ActiveDay[];
};

const HOUR = 3_600_000;

/** Début du compte des ouvertures de l'étape 2. */
export function installCountFrom(referredAt: Date, rules: Pick<StepRules, "guestGraceHours">): Date {
  return new Date(referredAt.getTime() - rules.guestGraceHours * HOUR);
}

/** Instant où l'étape 2 peut tomber au plus tôt. */
export function installReadyAt(referredAt: Date, rules: Pick<StepRules, "installHours">): Date {
  return new Date(referredAt.getTime() + rules.installHours * HOUR);
}

export type StepWindow = { firstDay: string; lastDay: string; /** minuit, heure locale, après le dernier jour */ end: Date };

function ymdIn(at: Date, timeZone: string): YMD {
  const c = filterContext(at, timeZone);
  return { year: c.year, month: c.month, day: c.day };
}

/** Les `days` premiers jours depuis le rattachement, jour du rattachement compris, dans le fuseau du jeu. */
export function stepWindow(referredAt: Date, days: number, timeZone: string): StepWindow {
  const first = ymdIn(referredAt, timeZone);
  return { firstDay: dayKey(first), lastDay: dayKey(addDays(first, days - 1)), end: localMidnight(addDays(first, days), timeZone) };
}

/** Jours actifs de la fenêtre, dans l'ordre. */
export function daysIn(days: readonly ActiveDay[], w: StepWindow): ActiveDay[] {
  return days.filter((d) => d.day >= w.firstDay && d.day <= w.lastDay).sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime());
}

function latest(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/** Instant où chaque étape est atteinte d'après les faits ; null : pas encore (ou plus jamais, voir stepProgress). */
export function evaluateSteps(f: RefereeFacts, rules: StepRules, timeZone: string, now: Date): StepTimes {
  const past = (d: Date) => (d.getTime() <= now.getTime() ? d : null);
  const s1 = f.registeredAt && f.verifiedAt ? past(latest(f.referredAt, f.registeredAt, f.verifiedAt)) : null;
  const s2 =
    s1 && f.installOpeningAt && f.installOpenings >= rules.installOpenings
      ? past(latest(s1, installReadyAt(f.referredAt, rules), f.installOpeningAt))
      : null;
  const active = (need: number, windowDays: number): Date | null => {
    if (!s2) return null;
    const inWindow = daysIn(f.activeDays, stepWindow(f.referredAt, windowDays, timeZone));
    return inWindow.length >= need ? past(latest(s2, inWindow[need - 1].firstAt)) : null;
  };
  return [s1, s2, active(rules.accroDays, rules.accroWindowDays), active(rules.fideleDays, rules.fideleWindowDays)];
}

/** DONE atteinte · NEXT en cours · LOCKED après la prochaine · MISSED fenêtre passée · HELD en attente de l'équipe. */
export type StepState = "DONE" | "NEXT" | "LOCKED" | "MISSED" | "HELD";

export type StepProgress = {
  state: StepState;
  at: Date | null;
  /** Avancement : 0 ou 1 (étape 1), ouvertures hors cadeau (étape 2), jours actifs dans la fenêtre (étapes 3 et 4). */
  have: number;
  need: number;
  /** Étape 2 : pas avant cet instant. */
  readyAt: Date | null;
  /** Étapes 3 et 4 : fin de la fenêtre. */
  deadline: Date | null;
};

/**
 * Ce que voit le joueur pour chaque étape. `held` : parrainage « À vérifier » sans décision ; `paid` : l'étape est
 * versée des deux côtés. Une étape atteinte pendant le blocage reste « en vérification » jusqu'à son versement.
 */
export function stepProgress(
  f: RefereeFacts,
  times: StepTimes,
  rules: StepRules,
  timeZone: string,
  now: Date,
  review: { held: boolean; paid: readonly boolean[] },
): StepProgress[] {
  const accro = stepWindow(f.referredAt, rules.accroWindowDays, timeZone);
  const fidele = stepWindow(f.referredAt, rules.fideleWindowDays, timeZone);
  const accroHave = daysIn(f.activeDays, accro).length;
  const fideleHave = daysIn(f.activeDays, fidele).length;
  const past = (end: Date) => now.getTime() >= end.getTime();
  const rows = [
    { have: f.registeredAt && f.verifiedAt ? 1 : 0, need: 1, readyAt: null, deadline: null, missed: false },
    { have: Math.min(f.installOpenings, rules.installOpenings), need: rules.installOpenings, readyAt: installReadyAt(f.referredAt, rules), deadline: null, missed: false },
    { have: Math.min(accroHave, rules.accroDays), need: rules.accroDays, readyAt: null, deadline: accro.end, missed: past(accro.end) && accroHave < rules.accroDays },
    { have: Math.min(fideleHave, rules.fideleDays), need: rules.fideleDays, readyAt: null, deadline: fidele.end, missed: past(fidele.end) && fideleHave < rules.fideleDays },
  ];
  let nextSeen = false;
  return rows.map((row, i) => {
    const at = times[i] ?? null;
    let state: StepState;
    if (at) state = review.held && !review.paid[i] ? "HELD" : "DONE";
    else if (row.missed) state = "MISSED";
    else if (!nextSeen) {
      nextSeen = true;
      state = review.held ? "HELD" : "NEXT";
    } else state = "LOCKED";
    return { state, at, have: row.have, need: row.need, readyAt: row.readyAt, deadline: row.deadline };
  });
}
