"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "../../ui/Button";

/**
 * Le favori « Envoyer à Kiraku » à installer une fois. React bloque les liens « javascript: » : on copie son adresse
 * pour créer le favori à la main, ou le code pour la console de kyara.games (secours).
 */
export function KyaraBookmarklet({ href, console: consoleSource, build }: { href: string; console: string; build: number }) {
  const t = useTranslations("admin.kyara.bookmarklet");
  const [copied, setCopied] = useState<"href" | "console" | "error" | null>(null);
  const copy = async (what: "href" | "console") => {
    try {
      await navigator.clipboard.writeText(what === "href" ? href : consoleSource);
      setCopied(what);
    } catch {
      setCopied("error");
    }
  };

  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="kyara-bookmarklet">
      <h3 id="kyara-bookmarklet" className="font-title text-lg font-bold">
        {t("title", { build })}
      </h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-text-muted">
        <li>{t("install")}</li>
        <li>{t("use")}</li>
        <li>{t("after")}</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={() => void copy("href")}>
          {t("copyBookmarklet")}
        </Button>
        <Button type="button" onClick={() => void copy("console")}>
          {t("copyConsole")}
        </Button>
      </div>
      <p role="status" className="text-sm text-text-muted">
        {copied === "href" ? t("copiedBookmarklet") : copied === "console" ? t("copiedConsole") : copied === "error" ? t("copyFailed") : ""}
      </p>
    </section>
  );
}
