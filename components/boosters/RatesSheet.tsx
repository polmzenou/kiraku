"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { buttonClasses } from "../ui/Button";
import { CloseIcon, IconButton } from "../ui/IconButton";

/**
 * Bouton « Taux » de la barre du bas (mobile) : ouvre le panneau complet du booster dans une
 * feuille qui monte du bas (<dialog> natif : focus piégé, Échap, clic sur le fond).
 */
export function RatesSheet({ children, label, triggerClassName }: { children: ReactNode; label?: string; triggerClassName?: string }) {
  const t = useTranslations("boosters");
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pathname = usePathname();
  const search = useSearchParams();

  // Changement de booster : on referme
  useEffect(() => {
    dialog.current?.close();
  }, [pathname, search]);

  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className={triggerClassName ?? buttonClasses("secondary", "shrink-0")}
      >
        {label ?? t("rates")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[88dvh] w-full max-w-none translate-y-full overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-border bg-bg p-0 text-text opacity-0 shadow-float transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-black/60 open:translate-y-0 open:opacity-100 starting:open:translate-y-full starting:open:opacity-0 motion-reduce:transition-none"
      >
        <div className="flex flex-col gap-3 px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <span aria-hidden="true" className="h-1.5 w-10 self-center rounded-full bg-text-muted/30" />
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="font-title text-lg font-extrabold">
              {t("ratesTitle")}
            </h2>
            <IconButton aria-label={t("close")} onClick={close} tone="lacquer">
              <CloseIcon />
            </IconButton>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
