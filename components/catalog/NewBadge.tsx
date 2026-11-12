import { useTranslations } from "next-intl";

/**
 * Pastille « Nouveau » d'une carte de la dernière sortie (/wiki/nouveautes), tant que le badge dure
 * (catalog.newCardHours). À passer dans le `corner` de la fuda ; le lien parent porte le texte lu
 * (`wiki.newLabel`), d'où le `aria-hidden`. `compact` : le sceau seul sur téléphone.
 */
export function NewBadge({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("wiki");
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5 rounded-sm bg-shu-btn px-1 text-[10px] leading-4 font-bold text-washi-paper">
      <span lang="ja" className="font-seal text-[11px] leading-none">
        新
      </span>
      <span className={compact ? "max-sm:hidden" : undefined}>{t("newBadge")}</span>
    </span>
  );
}
