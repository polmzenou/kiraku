"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { KYARA_SEAL } from "@/lib/kyara/codes";
import { KYARA_BANNER_COOKIE } from "@/lib/kyara/phase";
import { ButtonLink } from "../ui/ButtonLink";

const KEY = "kiraku.kyara-banner";
const ONE_YEAR = 60 * 60 * 24 * 365;
const noop = () => () => {};

function hiddenHere(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // stockage indisponible : la bannière reste
  }
}

/** « Plus tard » retenu pour le rendu serveur suivant : la bannière n'est plus rendue (préférence exemptée, lib/consent/registry.ts). */
function rememberDismissed() {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${KYARA_BANNER_COOKIE}=1; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}

/**
 * Invitation à importer sa collection Kyara, sur l'accueil, tant que le joueur peut agir (s'inscrire, lier Discord
 * ou demander). Masquable sur cet appareil : un cookie, que le serveur lit pour ne plus la rendre, et le stockage
 * local en secours (masquage d'avant le cookie, recopié dans le cookie à la visite suivante).
 */
export function KyaraImportBanner({ kind, deadline }: { kind: "OPEN" | "GUEST" | "NO_DISCORD"; deadline: number | null }) {
  const t = useTranslations("kyaraImport.banner");
  const format = useFormatter();
  const stored = useSyncExternalStore(noop, hiddenHere, () => false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (stored) rememberDismissed();
  }, [stored]);
  if (stored || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    rememberDismissed();
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* le cookie suffit */
    }
  };
  const date = deadline !== null ? format.dateTime(new Date(deadline), { dateStyle: "long" }) : "";

  return (
    <aside aria-labelledby="kyara-banner-title" className="relative flex flex-col gap-3 overflow-hidden lacquer rounded-card border border-ai/40 p-5 sm:flex-row sm:items-center sm:justify-between">
      <span aria-hidden="true" lang="ja" className="pointer-events-none absolute -top-6 right-2 font-seal text-8xl text-ai/10">
        {KYARA_SEAL}
      </span>
      <div className="relative flex flex-col gap-1">
        <p className="text-xs font-bold tracking-[0.2em] text-ai uppercase">{t("kicker")}</p>
        <h2 id="kyara-banner-title" className="font-heading text-xl">
          {t("title")}
        </h2>
        <p className="text-sm text-text-muted">{t(`body.${kind}`, { date })}</p>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center px-3 text-sm text-text-muted hover:text-text">
          {t("dismiss")}
        </button>
        <ButtonLink href="/compte/import-kyara" variant="primary">
          {t("cta")}
        </ButtonLink>
      </div>
    </aside>
  );
}
