import type { ReferralV2Rules } from "@/lib/referral/rules";

// Repères des quatre étapes du parrainage v2, partagés par les composants serveur et client (un module « use client »
// ne peut pas fournir de fonction ni de constante à un composant serveur).

export const STEP_KANJI = ["一", "二", "三", "四"] as const;

/** Numéro d'étape pour les clés de traduction (« 1.name »…). */
export const stepNo = (n: number) => Math.min(4, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4;

/** Conditions des étapes, lues dans les réglages, pour leurs textes (« Il ouvre 20 boosters en 2 jours »…). */
export type StepConditions = { openings: number; installDays: number; accroDays: number; accroWindow: number; fideleDays: number; fideleWindow: number };

/** Conditions des étapes d'après les règles en vigueur. */
export function stepConditions(rules: ReferralV2Rules): StepConditions {
  return {
    openings: rules.installOpenings,
    installDays: Math.max(1, Math.round(rules.installHours / 24)),
    accroDays: rules.accroDays,
    accroWindow: rules.accroWindowDays,
    fideleDays: rules.fideleDays,
    fideleWindow: rules.fideleWindowDays,
  };
}
