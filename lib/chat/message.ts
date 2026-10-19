// Texte d'un message du chat entre amis : texte brut, affiché tel quel (jamais interprété en HTML).

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

/**
 * Message prêt à enregistrer, ou null s'il est vide : caractères de contrôle et d'orientation
 * retirés, au plus deux sauts de ligne d'affilée, espaces de bord ôtés, longueur bornée.
 */
export function cleanChatBody(raw: string, maxLength: number): string | null {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0 || text.length > maxLength) return null;
  return text;
}

/** Badge de non-lus : rien à 0, « 9+ » au-delà de 9. */
export function unreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}
