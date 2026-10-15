import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { SealMark } from "./SealMark";

const FOOTER_LINKS = [
  { label: "footer.account", href: "/compte" },
  { label: "nav.collection", href: "/collection" },
  { label: "nav.referral", href: "/parrainage" },
  { label: "nav.missions", href: "/missions" },
  { label: "nav.boosters", href: "/" },
  { label: "nav.shop", href: "/boutique" },
  { label: "nav.market", href: "/marche" },
  { label: "nav.friends", href: "/amis" },
  { label: "footer.leaderboard", href: "/classement" },
  { label: "footer.wiki", href: "/wiki" },
] as const;

/**
 * Cadre commun sous l'en-tête (posé par le layout) : contenu centré à 1 200 px, pied de page.
 * `bottomBar` réserve la place d'une barre d'action collée en bas sur mobile (« tall » : barre haute,
 * visible jusqu'au desktop).
 */
export function PageShell({ children, bottomBar = false }: { children: ReactNode; bottomBar?: boolean | "tall" }) {
  const t = useTranslations();
  return (
    <div
      className={`mx-auto flex min-h-[calc(100dvh-3.5rem-var(--mobile-nav-height))] w-full max-w-[1200px] flex-col px-4 md:min-h-[calc(100dvh-4rem-var(--mobile-nav-height))] ${
        bottomBar === "tall"
          ? "pb-40 lg:pb-6"
          : bottomBar
            ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6"
            : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <main className="flex min-w-0 flex-1 flex-col gap-6 py-6">{children}</main>
      <footer className="flex flex-col gap-3 border-t border-border pt-4 text-xs text-text-muted">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-8">
          <Link href="/" aria-label={t("nav.home")} className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start text-text">
            <SealMark glyphs="気楽" size={28} />
            <span className="font-title text-lg font-extrabold tracking-wide">{t("common.appName")}</span>
          </Link>
          <nav aria-label={t("footer.nav")} className="min-w-0 flex-1">
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:flex lg:flex-wrap">
              {FOOTER_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center py-2 text-sm font-medium underline-offset-4 transition-colors hover:text-text hover:underline"
                  >
                    {t(label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="leading-relaxed">{t("footer.disclaimer")}</p>
      </footer>
    </div>
  );
}
