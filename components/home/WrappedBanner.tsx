"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { WRAPPED_BANNER_COOKIE } from "@/lib/wrapped/period";
import { ButtonLink } from "../ui/ButtonLink";

const key = (year: number) => `kiraku:wrapped-banner:${year}`;
const ONE_YEAR = 60 * 60 * 24 * 365;
const noop = () => () => {};

function hiddenHere(year: number): boolean {
  try {
    return window.localStorage.getItem(key(year)) === "1";
  } catch {
    return false; // stockage indisponible : la bannière reste
  }
}

/** « Plus tard » retenu pour le rendu serveur suivant : la bannière de cette année n'est plus rendue (préférence exemptée, lib/consent/registry.ts). */
function rememberDismissed(year: number) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${WRAPPED_BANNER_COOKIE}=${year}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}

/**
 * Annonce du Wrapped sur l'accueil, pendant la période. Masquable sur cet appareil, par année : un cookie, que le
 * serveur lit pour ne plus la rendre (server/wrapped/queries.ts), et le stockage local en secours (masquage d'avant
 * le cookie, recopié dans le cookie à la visite suivante).
 */
export function WrappedBanner({ year }: { year: number }) {
  const t = useTranslations("wrapped.banner");
  const stored = useSyncExternalStore(noop, () => hiddenHere(year), () => false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (stored) rememberDismissed(year);
  }, [stored, year]);
  if (stored || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    rememberDismissed(year);
    try {
      window.localStorage.setItem(key(year), "1");
    } catch {
      /* le cookie suffit */
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
