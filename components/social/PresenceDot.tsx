import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * Pastille verte en bas à droite d'un avatar quand le joueur est en ligne (rien sinon). Posée hors
 * de l'anneau du cadre ; le sceau du cadre, centré en bas, reste visible.
 */
export function WithPresence({
  online,
  size,
  announce = true,
  children,
}: {
  online?: boolean;
  size: number;
  /** false quand « En ligne » est déjà écrit à côté (en-tête du profil). */
  announce?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("presence");
  if (!online) return <>{children}</>;
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span
        aria-hidden="true"
        className="absolute right-0 bottom-0 rounded-full bg-hisui ring-2 ring-bg"
        style={{ width: dot, height: dot }}
      />
      {announce && <span className="sr-only">{t("online")}</span>}
    </span>
  );
}
