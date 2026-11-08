// Nom d'une vitrine : facultatif, visible par tous les visiteurs du profil, affiché tel quel par React.
import { cleanPlainText } from "../text/plain";

/** Longueur maximale (colonne Showcase.name, VARCHAR(32)). */
export const SHOWCASE_NAME_MAX = 32;

/**
 * Nom prêt à enregistrer : caractères de contrôle retirés, une seule ligne, espaces resserrés.
 * null s'il est vide (vitrine sans nom), undefined s'il est trop long.
 */
export function cleanShowcaseName(raw: string): string | null | undefined {
  const text = cleanPlainText(raw).replace(/\s+/g, " ");
  if (text.length === 0) return null;
  return [...text].length > SHOWCASE_NAME_MAX ? undefined : text;
}
