// Synchronisation du plateau en direct, en logique pure (testée sans navigateur) : que faire d'une mise à
// jour reçue, écart d'horloge avec le serveur, délais de la réclamation de fin de tour. Le serveur décide
// de tout ; le client ne fait que choisir quand redemander.

/**
 * Une mise à jour (réponse à une action, message en direct, rattrapage) face à la version affichée :
 * déjà vue (notre propre action, ou doublon), à jouer telle quelle, ou à rattraper depuis le journal
 * parce qu'elle ne part pas de notre version (un message a été manqué).
 */
export function updateStep(seen: number, u: { from: number; version: number }): "ignore" | "apply" | "resync" {
  if (u.version <= seen) return "ignore";
  return u.from === seen ? "apply" : "resync";
}

/** Écart retenu sans nouvelle mesure plus haute d'au moins ce pas (ms) : pas de rendu du plateau pour du bruit. */
export const SKEW_STEP_MS = 100;

/**
 * Écart d'horloge (serveur − appareil, en ms) après une mesure `heure du serveur − heure de réception`.
 * Chaque mesure le sous-estime du trajet de la réponse (et la vue du premier affichage, du chargement de la
 * page) : la plus haute est la plus juste. Une sous-estimation montrerait plus de temps qu'il n'en reste.
 */
export function nextSkew(current: number | null, sample: number, step = SKEW_STEP_MS): number {
  if (current === null || !Number.isFinite(current)) return sample;
  if (!Number.isFinite(sample)) return current;
  return sample >= current + step ? sample : current;
}

/** Délai (ms) avant l'échéance `endsAt` (heure du serveur, ISO), vue depuis l'appareil à `now` avec l'écart `skew`. */
export function deadlineDelay(endsAt: string, now: number, skew: number): number {
  const at = Date.parse(endsAt);
  return Number.isFinite(at) ? Math.max(0, at - (now + skew)) : 0;
}

/** Essais de réclamation d'une même échéance (premier compris) ; au-delà, le sondage et le balayage du serveur prennent le relais. */
export const MAX_CLAIM_ATTEMPTS = 6;

/**
 * Attente (ms) avant l'essai n° `attempt` (0 : le premier) de réclamer la fin d'un tour échu : une seconde
 * de marge pour la dernière action du joueur actif, puis de plus en plus d'écart après un refus (serveur
 * injoignable, ou « trop tôt » pour l'horloge du serveur). null : plus d'essai.
 */
export function claimDelay(attempt: number): number | null {
  if (attempt >= MAX_CLAIM_ATTEMPTS) return null;
  return Math.min(8_000, 1_000 * 2 ** Math.max(0, attempt));
}
