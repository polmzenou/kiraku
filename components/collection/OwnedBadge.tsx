import { useTranslations } from "next-intl";

/**
 * Pastille « déjà acquise » posée sur la carte d'un autre joueur (collection publique, vitrine,
 * souhaits, ventes, gros tirages, choix d'un échange). À passer dans le `corner` ou l'`overlay` de
 * la fuda pour qu'elle s'incline avec elle. `compact` : la coche seule sur téléphone (cartes minuscules).
 */
export function OwnedBadge({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("collection");
  return (
    <span className="inline-flex items-center gap-0.5 rounded-sm bg-sumi/85 px-1 text-[10px] font-bold leading-[16px] text-washi-paper">
      <span aria-hidden="true" className="text-kin">
        ✓
      </span>
      <span aria-hidden="true" className={compact ? "max-sm:hidden" : undefined}>
        {t("ownedBadge")}
      </span>
      <span className="sr-only">{t("ownedLabel")}</span>
    </span>
  );
}

/** Nombre d'exemplaires (×2, ×3), à passer dans le `corner` de la fuda. Texte pour lecteurs d'écran à fournir à côté. */
export function CopiesBadge({ count }: { count: number }) {
  return (
    <span aria-hidden="true" className="rounded-sm bg-sumi/85 px-1 text-[11px] font-bold tabular-nums text-washi-paper">
      ×{count}
    </span>
  );
}

/** La pastille pour l'`overlay` des petites fuda : sous 80 px de large, le `corner` est masqué. */
export function OwnedOverlay() {
  return (
    <span className="absolute right-0.5 bottom-0.5">
      <OwnedBadge compact />
    </span>
  );
}
