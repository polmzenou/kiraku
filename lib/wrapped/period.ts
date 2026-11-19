import { localMidnight } from "@/lib/economy/period";

// Période du Wrapped : l'année racontée (calendrier du fuseau du jeu) et la fenêtre pendant laquelle
// les joueurs peuvent la revoir (réglages wrapped.*, /admin/wrapped).

/** Année civile `year` dans le fuseau du jeu : du 1er janvier minuit au 1er janvier suivant (exclu). */
export function yearWindow(year: number, timeZone: string): { start: Date; end: Date } {
  return { start: localMidnight({ year, month: 1, day: 1 }, timeZone), end: localMidnight({ year: year + 1, month: 1, day: 1 }, timeZone) };
}

export type WrappedPhase = "off" | "before" | "open" | "closed";

export type WrappedWindow = { enabled: boolean; opensAt: string; closesAt: string };

/** Où en est le Wrapped à `now` : coupé dans l'admin, pas encore ouvert, ouvert, ou terminé. */
export function wrappedPhase(w: WrappedWindow, now: Date): WrappedPhase {
  if (!w.enabled) return "off";
  const t = now.getTime();
  if (t < Date.parse(w.opensAt)) return "before";
  if (t >= Date.parse(w.closesAt)) return "closed";
  return "open";
}
