"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { ButtonLink } from "../ui/ButtonLink";

const key = (year: number) => `kiraku:wrapped-banner:${year}`;
const noop = () => () => {};

function hiddenHere(year: number): boolean {
  try {
    return window.localStorage.getItem(key(year)) === "1";
  } catch {
    return false; // stockage indisponible : la bannière reste
  }
}

/**
 * Annonce du Wrapped sur l'accueil, pendant la période. Masquable : le choix reste dans ce navigateur
 * (stockage local, par année) ; le rendu serveur montre toujours la bannière.
 */
export function WrappedBanner({ year }: { year: number }) {
  const t = useTranslations("wrapped.banner");
  const stored = useSyncExternalStore(noop, () => hiddenHere(year), () => false);
  const [dismissed, setDismissed] = useState(false);
  if (stored || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(key(year), "1");
    } catch {
      /* rien à garder */
    }
  };

  return (
    <aside aria-labelledby="wrapped-banner-title" className="relative flex flex-col gap-3 overflow-hidden lacquer rounded-card border border-kin/40 p-5 sm:flex-row sm:items-center sm:justify-between">
      <span aria-hidden="true" lang="ja" className="pointer-events-none absolute -top-6 right-2 font-seal text-8xl text-kin/10">年</span>
      <div className="relative flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-kin">{t("kicker", { year })}</p>
        <h2 id="wrapped-banner-title" className="font-heading text-xl">{t("title")}</h2>
        <p className="text-sm text-text-muted">{t("body")}</p>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center px-3 text-sm text-text-muted hover:text-text">{t("dismiss")}</button>
        <ButtonLink href="/wrapped" variant="primary">{t("cta")}</ButtonLink>
      </div>
    </aside>
  );
}
