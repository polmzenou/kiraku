import type { CasinoRules } from "./rules";

// Ouverture du casino, pilotée par casino.opensAt : pur, sans horloge cachée (le serveur et les composants
// passent `now`).
//   - features.casino éteint → caché (aperçu admin seulement) ;
//   - date vide ou future → teaser (avec compte à rebours si la date est posée) ;
//   - date passée → ouvert. Pendant newBadgeDays jours : badge « Nouveau », cérémonie et annonce. La cérémonie se
//     joue une fois par appareil : le serveur dit si la fenêtre est ouverte, le navigateur s'il l'a déjà vue
//     (components/casino/CeremonyGate.tsx).

export type CasinoPhase = "hidden" | "teaser" | "open";

type Opening = Pick<CasinoRules, "visible" | "opensAt">;
type Launch = Opening & Pick<CasinoRules, "newBadgeDays">;

const DAY = 86_400_000;

export function casinoPhase(r: Opening, now: number): CasinoPhase {
  if (!r.visible) return "hidden";
  if (r.opensAt === null || now < r.opensAt) return "teaser";
  return "open";
}

export type CasinoAccess = {
  phase: CasinoPhase;
  /** Hall et jeux accessibles : casino ouvert, ou aperçu admin. */
  canEnter: boolean;
  /** Aperçu admin avant l'ouverture : bandeau « Aperçu », les joueurs voient encore le teaser. */
  preview: boolean;
};

export function casinoAccess(r: Opening, now: number, isAdmin: boolean): CasinoAccess {
  const phase = casinoPhase(r, now);
  if (phase === "open") return { phase, canEnter: true, preview: false };
  return { phase, canEnter: isAdmin, preview: isAdmin };
}

/** Fenêtre de lancement `[opensAt, opensAt + newBadgeDays[` ; vide si newBadgeDays vaut 0. */
export function inLaunchWindow(r: Launch, now: number): boolean {
  if (casinoPhase(r, now) !== "open" || r.opensAt === null) return false;
  return now < r.opensAt + r.newBadgeDays * DAY;
}

export type CasinoBadge = "soon" | "new" | null;

/** Pastille de l'entrée de menu et de la tuile du Compte. */
export function casinoBadge(r: Launch, now: number): CasinoBadge {
  const phase = casinoPhase(r, now);
  if (phase === "teaser") return "soon";
  return inLaunchWindow(r, now) ? "new" : null;
}

/**
 * Modale « Le casino ouvre ses portes » : comptes inscrits avant l'ouverture, pendant la fenêtre de
 * lancement. Jamais aux invités ; un compte créé après l'ouverture découvre le casino par le menu.
 */
export function announcementDue(r: Launch, now: number, user: { isGuest: boolean; createdAt: Date }): boolean {
  if (user.isGuest || r.opensAt === null) return false;
  return inLaunchWindow(r, now) && user.createdAt.getTime() < r.opensAt;
}
