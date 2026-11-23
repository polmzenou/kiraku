"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { KYARA_SEAL } from "@/lib/kyara/codes";
import { ButtonLink } from "../ui/ButtonLink";

const KEY = "kiraku.kyara-banner";
const noop = () => () => {};

function hiddenHere(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // stockage indisponible : la bannière reste
  }
}

/**
 * Invitation à importer sa collection Kyara, sur l'accueil, tant que le joueur peut agir (s'inscrire, lier Discord
 * ou demander). Masquable sur cet appareil ; le rendu serveur la montre toujours.
 */
export function KyaraImportBanner({ kind, deadline }: { kind: "OPEN" | "GUEST" | "NO_DISCORD"; deadline: number | null }) {
  const t = useTranslations("kyaraImport.banner");
  const format = useFormatter();
  const stored = useSyncExternalStore(noop, hiddenHere, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (stored || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* rien à garder */
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
