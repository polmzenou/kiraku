// Texte d'un message du chat entre amis : texte brut, affiché tel quel (jamais interprété en HTML).
import { cleanPlainText } from "../text/plain";

/**
 * Message prêt à enregistrer, ou null s'il est vide : caractères de contrôle et d'orientation
 * retirés, au plus deux sauts de ligne d'affilée, espaces de bord ôtés, longueur bornée.
 */
export function cleanChatBody(raw: string, maxLength: number): string | null {
  const text = cleanPlainText(raw);
  if (text.length === 0 || text.length > maxLength) return null;
  return text;
}

/** Badge de non-lus : rien à 0, « 9+ » au-delà de 9. */
export function unreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}
