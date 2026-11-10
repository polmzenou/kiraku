// Mode spoiler : « hide » floute l'illustration des cartes spoil (personnage ou transformation qui dévoile l'histoire).
// Préférence d'affichage par appareil, comme le thème : cookie lu au rendu serveur, attribut data-spoiler sur <html>.
export const SPOILER_MODES = ["show", "hide"] as const;
export type SpoilerMode = (typeof SPOILER_MODES)[number];

export const DEFAULT_SPOILER_MODE: SpoilerMode = "show";
export const SPOILER_COOKIE = "kiraku-spoiler";

export function parseSpoilerMode(value: string | null | undefined): SpoilerMode {
  return SPOILER_MODES.includes(value as SpoilerMode) ? (value as SpoilerMode) : DEFAULT_SPOILER_MODE;
}
