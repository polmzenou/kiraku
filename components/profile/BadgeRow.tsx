import { useTranslations } from "next-intl";
import { BADGE_CLASS, BADGE_KANJI, type Badge } from "@/lib/profile/badges";

/**
 * Badges d'un joueur : sceau et nom. Sans « use client » : rendu côté serveur dans l'en-tête du profil (un visiteur
 * ne charge pas la feuille « Personnaliser » pour l'afficher), côté client dans l'aperçu de cette feuille.
 */
export function BadgeRow({ badges }: { badges: readonly Badge[] }) {
  const t = useTranslations("profile.customize");
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("badges")}>
      {badges.map((b) => (
        <li key={b} className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-bold ${BADGE_CLASS[b].pill}`}>
          <span aria-hidden="true" lang="ja" className="font-seal">
            {BADGE_KANJI[b]}
          </span>
          {t(`badgeNames.${b}`)}
        </li>
      ))}
    </ul>
  );
}
