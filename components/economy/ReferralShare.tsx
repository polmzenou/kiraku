"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { getPathname } from "@/i18n/navigation";
import { REFERRAL_IMAGES } from "@/lib/referral/assets";
import { Button } from "../ui/Button";

const noop = () => () => undefined;

/**
 * Code et lien d'invitation : copier, ou partager avec la feuille du téléphone. Un code perso (posé par l'équipe) est
 * gravé sur une plaque d'or (PV2-PLAQUE-CODE), avec le code standard du joueur, qui marche toujours.
 */
export function ReferralShare({ code, vanity = null }: { code: string; vanity?: { standard: string } | null }) {
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
        {vanity ? (
          <span className="relative isolate inline-flex flex-col items-center gap-0.5 self-start px-8 pt-3 pb-3.5 text-[#2a1f08] drop-shadow-[0_6px_10px_rgb(0_0_0/0.3)]">
            <Image src={REFERRAL_IMAGES["plaque-code"].src} alt="" fill sizes="360px" className="-z-10 object-fill" />
            <small className="text-[10px] font-extrabold tracking-[0.14em] uppercase opacity-75">{t("vanityLabel")}</small>
            <b className="font-title text-2xl font-extrabold tracking-[0.18em] sm:text-3xl">{code}</b>
          </span>
        ) : (
          <span className="self-start rounded-card border-2 border-dashed border-kin/70 bg-bg/60 px-4 py-2 font-title text-2xl font-extrabold tracking-[0.3em] text-kin sm:text-3xl">
            {code}
          </span>
        )}
      </p>
      {vanity && <p className="text-xs text-text-muted">{t.rich("oldCode", { code: vanity.standard, s: (chunks) => <s>{chunks}</s> })}</p>}
      <div className="flex flex-wrap gap-2" aria-live="polite">
        <Button type="button" variant="primary" onClick={() => copy("link")}>
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
