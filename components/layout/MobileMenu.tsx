"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, MOBILE_NAV_ITEMS, type NavFeatures } from "@/lib/nav";
import type { Theme } from "@/lib/theme";
import { logout } from "@/server/actions/account";
import { LocaleSwitcher } from "../LocaleSwitcher";
import { ThemeToggle } from "../ThemeToggle";
import { NavLinks } from "./NavLinks";

/**
 * Navigation mobile fixe et panneau « Plus » qui monte du bas.
 * Le <dialog> natif piège le focus et se ferme avec Échap ou un appui sur le fond.
 */
export function MobileMenu({
  theme,
  isAdmin,
  accountHref,
  signedIn,
  features,
}: {
  theme: Theme;
  isAdmin: boolean;
  accountHref: string;
  signedIn: boolean;
  features: NavFeatures;
}) {
  const t = useTranslations("nav");
  const tAccount = useTranslations("account");
  const tAuth = useTranslations("auth.login");
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = useLocale();
  const titleId = useId();
  const panelId = useId();
  const moreActive = !MOBILE_NAV_ITEMS.some((item) => isActive(item, pathname));

  const close = () => dialog.current?.close();

  // Changement de page (lien, langue) : on referme
  useEffect(() => {
    dialog.current?.close();
  }, [pathname, locale]);

  // Un panneau ouvert ne doit pas laisser le desktop inerte après un redimensionnement.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 h-[var(--mobile-nav-height)] border-t border-border bg-surface/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-4px_24px_rgb(0_0_0/0.12)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-full max-w-xl grid-cols-5">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            return (
              <li key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full min-h-11 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors hover:text-text ${active ? "font-bold text-shu" : "text-text-muted"}`}
                >
                  <MobileNavIcon name={item.key} />
                  <span>{t(item.key)}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              aria-haspopup="dialog"
              onClick={() => {
                dialog.current?.showModal();
                setOpen(true);
              }}
              className={`flex h-full min-h-11 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors hover:text-text ${open || moreActive ? "font-bold text-shu" : "text-text-muted"}`}
            >
              <MobileNavIcon name="more" />
              <span>{t("more")}</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialog}
        id={panelId}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Clic sur le fond (hors du panneau) : on referme
          if (e.target === dialog.current) close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none translate-y-full overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface p-0 text-text opacity-0 shadow-[0_-12px_32px_rgb(0_0_0/0.3)] transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-black/60 open:translate-y-0 open:opacity-100 starting:open:translate-y-full starting:open:opacity-0 motion-reduce:transition-none lg:hidden"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <span aria-hidden="true" className="-mb-4 h-1 w-10 self-center rounded-full bg-text-muted/30" />
          <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-surface px-4">
            <h2 id={titleId} className="text-lg font-bold">
              {t("more")}
            </h2>
            <button
              type="button"
              aria-label={t("closeMenu")}
              onClick={close}
              className="inline-flex size-11 items-center justify-center rounded-button text-2xl leading-none"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <nav aria-label={t("label")}>
            <NavLinks layout="stack" features={features} onNavigate={close} />
            <ul className="flex flex-col">
              <li>
                <Link
                  href={accountHref}
                  onClick={close}
                  aria-current={pathname === accountHref ? "page" : undefined}
                  className="flex min-h-12 items-center border-b border-border px-1 text-base text-text-muted aria-[current=page]:font-bold aria-[current=page]:text-text"
                >
                  {t("account")}
                </Link>
              </li>
              {isAdmin && (
                <li>
                  <Link
                    href="/admin"
                    onClick={close}
                    aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                    className="flex min-h-12 items-center border-b border-border px-1 text-base text-text-muted aria-[current=page]:font-bold aria-[current=page]:text-text"
                  >
                    {t("admin")}
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <section className="flex flex-col gap-5">
            <h3 className="text-sm font-bold text-text-muted">{t("preferences")}</h3>
            <ThemeToggle initial={theme} />
            <LocaleSwitcher />
          </section>

          {signedIn ? (
            <form action={logout}>
              <button type="submit" className="flex min-h-12 w-full items-center rounded-button border border-shu/40 bg-shu/10 px-4 text-sm font-bold text-shu hover:bg-shu/20">
                {tAccount("logout")}
              </button>
            </form>
          ) : (
            <Link href="/connexion" onClick={close} className="flex min-h-12 items-center rounded-button border border-shu/40 bg-shu/10 px-4 text-sm font-bold text-shu hover:bg-shu/20">
              {tAuth("title")}
            </Link>
          )}
        </div>
      </dialog>
    </>
  );
}

function MobileNavIcon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {name === "boosters" && <><path d="m6 3 2 1 2-1 2 1 2-1 2 1 2-1v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z" /><path d="m13 8-4 5h4l-2 4 5-6h-4l1-3Z" /></>}
      {name === "collection" && <><path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v15" /></>}
      {name === "combat" && <><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6m-3 3 4 4m-1 1 2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4m-2-1-4 4m0-2 2 2" /></>}
      {name === "market" && <><path d="m3 9 2-6h14l2 6M4 13v8h16v-8M9 21v-6h6v6M8 3 7 9m9-6 1 6M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0H3Z" /></>}
      {name === "more" && <><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="20" cy="12" r="1.5" fill="currentColor" stroke="none" /></>}
    </svg>
  );
}
