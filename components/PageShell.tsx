import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Cadre commun sous l'en-tête (posé par le layout) : contenu centré à 1 200 px, pied de page.
 * `bottomBar` réserve la place d'une barre d'action collée en bas sur mobile (« tall » : barre haute,
 * visible jusqu'au desktop).
 */
export function PageShell({ children, bottomBar = false }: { children: ReactNode; bottomBar?: boolean | "tall" }) {
  const t = useTranslations();
  return (
    <div
      className={`mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-[1200px] flex-col px-4 md:min-h-[calc(100dvh-4rem)] ${
        bottomBar === "tall"
          ? "pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-6"
          : bottomBar
            ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6"
            : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <main className="flex min-w-0 flex-1 flex-col gap-6 py-6">{children}</main>
      <footer className="flex flex-col gap-2 border-t border-border pt-2 text-xs text-text-muted">
        <nav aria-label={t("footer.nav")}>
          <Link href="/wiki" className="inline-flex min-h-11 items-center text-sm text-ai underline underline-offset-4">
            {t("footer.wiki")}
          </Link>
        </nav>
        <p>{t("footer.disclaimer")}</p>
      </footer>
    </div>
  );
}
