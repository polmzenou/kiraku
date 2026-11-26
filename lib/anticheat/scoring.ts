import { z } from "@/lib/zod";

// Barème de la détection des multi-comptes (réglage multiAccount.scoring, /admin/general) : poids de chaque indice
// et seuils. Il décide aussi des mises « À vérifier » du parrainage v2 (lib/referral/hold.ts, referral.v2.holdScore).
// Module sans dépendance : lu par lib/anticheat/score.ts et par les réglages (lib/settings/defaults.ts).

const weight = z.number().int().min(0).max(200);

export const detectionScoringSchema = z
  .object({
    device: weight, // même cookie appareil : même navigateur
    emailAlias: weight, // même boîte de réception (alias +, points Gmail)
    ip: weight, // même IP (IPv6 : même /64), partagée par peu de comptes
    emailStem: weight, // même racine d'e-mail (paulmehr, paul.mehr68)
    flow: weight, // valeur qui va presque toujours dans le même sens
    referral: weight, // l'un a parrainé l'autre
    createdClose: weight, // comptes créés à quelques minutes d'écart (le double avec une IP commune)
    usernameStem: weight, // même racine de pseudo
    onlyFriend: weight, // l'un est le seul ami de l'autre
    interactions: weight, // nombreux échanges entre eux, sans sens dominant
    // Création rapprochée : écart maximal entre les deux créations
    createdCloseMinutes: z.number().int().min(0).max(1_440),
    // Flux à sens unique : au moins flowMin transferts orientés, dont flowSharePct % dans le même sens
    flowMin: z.number().int().min(1).max(100),
    flowSharePct: z.number().int().min(50).max(100),
    // Échanges sans sens dominant : à partir de ce nombre de transferts, échanges compris
    interactionsMin: z.number().int().min(1).max(1_000),
  })
  .strict();

export type DetectionScoring = z.infer<typeof detectionScoringSchema>;

/** Barème d'origine : valeurs par défaut du réglage (une base sans réglage enregistré garde ces scores). */
export const DETECTION_SCORING_DEFAULT: DetectionScoring = {
  device: 60,
  emailAlias: 50,
  ip: 30,
  emailStem: 30,
  flow: 20,
  referral: 15,
  createdClose: 10,
  usernameStem: 10,
  onlyFriend: 10,
  interactions: 10,
  createdCloseMinutes: 15,
  flowMin: 3,
  flowSharePct: 80,
  interactionsMin: 5,
};

/** Champs du barème, dans l'ordre du formulaire de l'admin. */
export const DETECTION_SCORING_FIELDS = Object.keys(DETECTION_SCORING_DEFAULT) as (keyof DetectionScoring)[];
