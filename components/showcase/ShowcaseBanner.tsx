import { SHOWCASE_THEMES, type ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import "./showcase.css";

/**
 * Bannière du profil : le décor de la vitrine principale derrière l'en-tête (image fixe, 3:4 sur
 * téléphone et 16:9 au-delà de 48rem), voilée et fondue vers le bas (showcase.css). Rien pour Sans
 * décor. Purement décorative : cachée aux lecteurs d'écran.
 */
export function ShowcaseBanner({ theme }: { theme: ShowcaseThemeId }) {
  const media = SHOWCASE_THEMES[theme].media;
  if (!media) return null;
  return (
    <div className="vt-banner" data-theme={theme} aria-hidden="true">
      <picture>
        <source media="(min-width: 48rem)" srcSet={media.desktop.still} />
        <img src={media.mobile.still} alt="" decoding="async" draggable={false} />
      </picture>
    </div>
  );
}
