// Texte brut saisi par un joueur ou un admin (chat, commentaires, motifs) : affiché tel quel par React,
// jamais interprété en HTML.
// Plages retirées : contrôles C0 (sauf saut de ligne) et C1, espaces de largeur nulle et marques
// d'orientation (qui retourneraient l'affichage). Construites par code pour rester lisibles.
const STRIPPED: [number, number][] = [
  [0x00, 0x09],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
];
const hex = (n: number) => n.toString(16).padStart(4, "0");
const CONTROL = new RegExp(`[${STRIPPED.map(([a, b]) => `\\u${hex(a)}-\\u${hex(b)}`).join("")}]`, "g");

/** Longueur maximale d'un commentaire (annonce, échange, vente, motif de refus, mot de l'équipe). */
export const NOTE_MAX_LENGTH = 200;

/**
 * Caractères de contrôle et d'orientation retirés, au plus deux sauts de ligne d'affilée, espaces
 * de bord ôtés. Peut renvoyer une chaîne vide.
 */
export function cleanPlainText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
