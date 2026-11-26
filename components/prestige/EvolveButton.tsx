import { useTranslations } from "next-intl";
import { ButtonLink } from "../ui/ButtonLink";
import "./prestige.css";

/**
 * Bouton rouge « Évoluer », sous « Personnaliser » sur son propre profil : un halo d'or quand les seuils par rareté sont
 * atteints. Les blocages (carte en jeu ailleurs, délai, taille de la collection) se lisent sur /prestige : le halo et le
 * texte lu ne promettent donc que les seuils, pas une renaissance possible tout de suite.
 */
export function EvolveButton({ ready }: { ready: boolean }) {
  const t = useTranslations("prestige.profile");
  return (
    <ButtonLink href="/prestige" variant="primary" className="pr-evolve w-full" data-ready={ready || undefined}>
      <span aria-hidden="true" lang="ja" className="font-seal text-lg">
        転
      </span>
      {t("evolve")}
      {ready && <span className="sr-only">{t("evolveReady")}</span>}
    </ButtonLink>
  );
}
