"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { getPathname } from "@/i18n/navigation";
import { Button } from "../ui/Button";

/** Partage du profil public : feuille de partage du téléphone, sinon copie du lien. */
export function ShareProfileButton({ username, title }: { username: string; title: string }) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(getPathname({ href: `/u/${username}`, locale }), window.location.origin).href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        // Partage annulé par le joueur : rien à faire
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("share"), url);
    }
  }

  return (
    <Button type="button" onClick={share}>
      <span aria-live="polite">{copied ? t("copied") : t("share")}</span>
    </Button>
  );
}
