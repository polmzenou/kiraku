"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { getPathname } from "@/i18n/navigation";
import { Button } from "../ui/Button";

const noop = () => () => undefined;

/** Code et lien d'invitation : copier, ou partager avec la feuille du téléphone. */
export function ReferralShare({ code }: { code: string }) {
  const t = useTranslations("economy.referral");
  const locale = useLocale();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  // Partage natif : seulement là où le navigateur le propose (jamais au rendu serveur)
  const canShare = useSyncExternalStore(noop, () => "share" in navigator, () => false);

  const url = () => new URL(getPathname({ href: `/i/${code}`, locale }), window.location.origin).href;

  async function copy(kind: "code" | "link") {
    const text = kind === "code" ? code : url();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt(t("copyLink"), text);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: t("shareTitle"), text: t("shareText"), url: url() });
    } catch {
      // Partage annulé ou indisponible : rien à faire
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-wide text-text-muted uppercase">{t("yourCode")}</span>
        <span className="self-start rounded-lg border-2 border-dashed border-kin/70 bg-bg/60 px-4 py-2 font-title text-2xl font-extrabold tracking-[0.3em] text-kin sm:text-3xl">
          {code}
        </span>
      </p>
      <div className="flex flex-wrap gap-2" aria-live="polite">
        <Button type="button" variant="shu" onClick={() => copy("link")}>
          {copied === "link" ? t("copied") : t("copyLink")}
        </Button>
        <Button type="button" onClick={() => copy("code")}>
          {copied === "code" ? t("copied") : t("copyCode")}
        </Button>
        {canShare && (
          <Button type="button" onClick={share}>
            {t("share")}
          </Button>
        )}
      </div>
    </div>
  );
}
