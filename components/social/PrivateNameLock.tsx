import { useTranslations } from "next-intl";

/**
 * Petit cadenas après un pseudo que les joueurs ne voient pas (profil privé ou réservé aux amis, banni,
 * blocage) et que seul un admin lit. Le texte lu par les lecteurs d'écran dit pourquoi.
 */
export function PrivateNameLock({ className = "" }: { className?: string }) {
  const t = useTranslations("playerName");
  return (
    <span title={t("revealed")} className={`inline-flex shrink-0 items-center text-text-muted ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </svg>
      <span className="sr-only">{t("revealed")}</span>
    </span>
  );
}
