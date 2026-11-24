"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { getPathname } from "@/i18n/navigation";
import { withShareCode } from "@/lib/referral/share";
import { useShareCode } from "../referral/ShareCode";

/** Copie le lien public du tirage (/tirage/[id]), avec le code de parrain du joueur. */
export function CopyLinkButton({ openingId }: { openingId: string }) {
  const t = useTranslations("opening");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const shareCode = useShareCode();

  async function copy() {
    const url = withShareCode(new URL(getPathname({ href: `/tirage/${openingId}`, locale }), window.location.origin).href, shareCode);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("copyLink"), url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center rounded-control px-2 text-sm text-link underline underline-offset-4"
    >
      <span aria-live="polite">{copied ? t("copied") : t("copyLink")}</span>
    </button>
  );
}
