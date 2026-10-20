// Variantes (formes alternatives AR, versions Gold) : une carte de base, une image propre.

export type VariantError = "VARIANT_REQUIRED" | "VARIANT_INVALID" | "VARIANT_IMAGE_REUSED";
export type VariantCard = { id?: string; variantOfId: string | null; imageUrl: string };
export type VariantBase = { id: string; variantOfId: string | null; imageUrl: string } | null;

/** Règles d'une variante, vérifiées côté serveur à chaque écriture (sauvegarde, publication, actions groupées). */
export function validateVariant(card: VariantCard, base: VariantBase, variantRequired: boolean): VariantError | null {
  if (!card.variantOfId) return variantRequired ? "VARIANT_REQUIRED" : null;
  // Pas de chaîne de variantes : la base est toujours une carte « normale », jamais la carte elle-même.
  if (!base || base.id !== card.variantOfId || base.variantOfId || base.id === card.id) return "VARIANT_INVALID";
  // La variante a toujours sa propre image, choisie par l'admin.
  if (variantRequired && !card.imageUrl) return "VARIANT_IMAGE_REUSED";
  if (card.imageUrl && card.imageUrl === base.imageUrl) return "VARIANT_IMAGE_REUSED";
  return null;
}
