"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { useAnnouncementDialog } from "../welcome/useAnnouncementDialog";
import { ButtonLink } from "../ui/ButtonLink";
import { CasinoRules } from "./CasinoRules";
// Rendue par le layout racine : seule la pièce qui tourne, pas tout casino.css (qui entrerait dans chaque page)
import "./coin-spin.css";

/**
 * « Le casino ouvre ses portes » : une fois par compte, à la première visite d'un écran de découverte après
 * l'ouverture (jamais aux invités ni aux comptes créés depuis). La pièce tourne, les règles, puis le casino.
 */
export function CasinoAnnouncementModal({ userId, gauge }: { userId: string; gauge?: ReactNode }) {
  const t = useTranslations("casino.announcement");
  const common = useTranslations("common");
  const dialog = useAnnouncementDialog(userId, "casino");
  const titleId = useId();
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-3xl border border-kin/30 bg-bg p-0 text-text opacity-0 shadow-[0_24px_100px_rgb(0_0_0/0.45)] transition-[opacity,translate,display,overlay] transition-discrete duration-300 backdrop:bg-black/75 backdrop:backdrop-blur-sm open:flex open:translate-y-0 open:flex-col open:opacity-100 starting:open:translate-y-4 starting:open:opacity-0 motion-reduce:transition-none"
    >
      <div className="relative isolate flex min-h-0 flex-col items-center gap-3 overflow-y-auto overscroll-contain px-5 pt-7 pb-5 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--k-kin),transparent_60%)] opacity-15" />
        <button
          type="button"
          aria-label={common("close")}
          onClick={close}
          className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-full border border-border bg-bg/70 text-2xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div aria-hidden="true" className="cf-mspin">
          <div className="cf-mspin-coin">
            <span className="cf-mspin-front" />
            <span className="cf-mspin-back" />
          </div>
        </div>
        <span className="rounded-pill bg-kin/15 px-2.5 py-0.5 text-xs font-bold text-kin ring-1 ring-kin/45 ring-inset">{t("tag")}</span>
        <h2 id={titleId} tabIndex={-1} className="font-heading text-2xl leading-tight text-balance outline-none">
          {t("title")}
        </h2>
        <p className="text-sm text-text-muted">{t("body")}</p>
        <CasinoRules className="self-stretch text-left" />
        {gauge}
        <ButtonLink href="/casino" prefetch={false} variant="primary" size="lg" className="mt-1 w-full" onClick={close}>
          {t("enter")}
        </ButtonLink>
        <button type="button" onClick={close} className="min-h-11 text-sm text-text-muted underline-offset-4 hover:underline">
          {t("later")}
        </button>
      </div>
    </dialog>
  );
}
