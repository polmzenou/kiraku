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
