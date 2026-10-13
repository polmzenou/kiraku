import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
      <footer className="border-t border-border pt-4 text-xs text-text-muted">{t("footer.disclaimer")}</footer>
    </div>
  );
}
