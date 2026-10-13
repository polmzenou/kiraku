import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { SealMark } from "./SealMark";

/** Cadre commun provisoire : en-tête avec le logo, contenu, pied de page. */
export function PageShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3 py-4">
        <SealMark glyphs="気楽" size={40} />
        <span className="font-title text-2xl font-extrabold tracking-wide">{t("common.appName")}</span>
      </header>
      <main className="flex flex-1 flex-col gap-6 py-4">{children}</main>
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
