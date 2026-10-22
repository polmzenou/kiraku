import { useTranslations } from "next-intl";
import { X_HANDLE, X_URL } from "@/lib/links";
import { buttonClasses } from "../ui/Button";

/** Logo X, en couleur du texte pour rester dans la DA. */
function XLogo({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

/** Lien vers le compte X de Kiraku : discret dans le pied de page, bouton dans les mentions légales. */
export function XFollowLink({ variant = "footer" }: { variant?: "footer" | "button" }) {
  const t = useTranslations("social");
  if (variant === "button") {
    return (
      <a href={X_URL} target="_blank" rel="noopener noreferrer me" className={buttonClasses("secondary", "self-start")}>
        <XLogo className="size-4" />
        {t("followX", { handle: X_HANDLE })}
      </a>
    );
  }
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer me"
      aria-label={t("followX", { handle: X_HANDLE })}
      className="inline-flex min-h-11 min-w-11 items-center gap-1.5 py-2 underline-offset-4 transition-colors hover:text-text hover:underline"
    >
      <XLogo className="size-3.5" />
      <span>{t("x")}</span>
    </a>
  );
}
