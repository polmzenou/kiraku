"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Theme } from "@/lib/theme";
import { LocaleSwitcher } from "../LocaleSwitcher";
import { ThemeToggle } from "../ThemeToggle";
import { NavLinks } from "./NavLinks";

/**
 * Menu burger (< 768 px) : un <dialog> natif (focus piégé, Échap) qui glisse de la droite,
 * entrées empilées verticalement. Rien ne défile horizontalement.
 */
export function MobileMenu({ theme, isAdmin }: { theme: Theme; isAdmin: boolean }) {
  const t = useTranslations("nav");
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const titleId = useId();

  const close = () => dialog.current?.close();

  // Changement de page (lien, langue) : on referme
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className="inline-flex size-11 shrink-0 flex-col items-center justify-center gap-[5px] rounded-button md:hidden"
      >
        <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-text" />
        <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-text" />
        <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-text" />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Clic sur le fond (hors du panneau) : on referme
          if (e.target === dialog.current) close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none translate-x-full overflow-y-auto overscroll-contain border-l border-border bg-surface p-0 text-text opacity-0 transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-black/60 open:translate-x-0 open:opacity-100 starting:open:translate-x-full starting:open:opacity-0 md:hidden"
      >
        <div className="flex min-h-full flex-col gap-6 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-bold">
              {t("menuTitle")}
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
            <NavLinks layout="stack" onNavigate={close} />
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/"
                  onClick={close}
                  aria-current={pathname === "/" ? "page" : undefined}
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
                    className="flex min-h-12 items-center border-b border-border px-1 text-base text-text-muted"
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
        </div>
      </dialog>
    </>
  );
}
