"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { bookmarkletHref, bookmarkletSource, BOOKMARKLET_BUILD, type BookmarkletTexts } from "@/lib/kyara/bookmarklet";
import { issueKyaraStaffKeyAction, type KyaraStaffError } from "@/server/actions/admin-kyara";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/Field";

/**
 * Favori « Envoyer à Kiraku » de ce membre de l'équipe : « Générer mon favori » crée sa clé (montrée une seule fois,
 * l'ancien favori cesse de marcher), puis on copie l'adresse du favori (React bloque les liens « javascript: ») ou le
 * code pour la console de kyara.games (secours).
 */
export function KyaraBookmarklet({ receiveUrl, texts, issuedAt }: { receiveUrl: string; texts: BookmarkletTexts; issuedAt: string | null }) {
  const t = useTranslations("admin.kyara.bookmarklet");
  const tError = useTranslations("admin.kyara.errors");
  const format = useFormatter();
  const [code, setCode] = useState<{ href: string; console: string } | null>(null);
  const [error, setError] = useState<KyaraStaffError | null>(null);
  const [copied, setCopied] = useState<"href" | "console" | "error" | null>(null);
  // Copie refusée par le navigateur : le code s'affiche, à copier à la main
  const [manual, setManual] = useState<"href" | "console" | null>(null);
  const [pending, start] = useTransition();
  const manualId = useId();

  const generate = () => {
    if (issuedAt !== null && !window.confirm(t("regenerateConfirm"))) return;
    start(async () => {
      setError(null);
      setCopied(null);
      setManual(null);
      try {
        const res = await issueKyaraStaffKeyAction();
        if (!res.ok) return setError(res.error);
        const source = (mode: "navigate" | "print") => bookmarkletSource({ receiveUrl, staffKey: res.key, texts, mode });
        setCode({ href: bookmarkletHref(source("navigate")), console: source("print") });
      } catch {
        // La clé a pu changer côté serveur sans arriver ici : en générer une autre remplace l'ancien favori
        setError("UNAVAILABLE");
      }
    });
  };
  const copy = async (what: "href" | "console") => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(what === "href" ? code.href : code.console);
      setCopied(what);
      setManual(null);
    } catch {
      setCopied("error");
      setManual(what);
    }
  };

  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="kyara-bookmarklet">
      <h3 id="kyara-bookmarklet" className="font-title text-lg font-bold">
        {t("title", { build: BOOKMARKLET_BUILD })}
      </h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-text-muted">
        <li>{t("install")}</li>
        <li>{t("use")}</li>
        <li>{t("after")}</li>
      </ol>
      <p className="text-sm">{issuedAt !== null ? t("issued", { date: format.dateTime(new Date(issuedAt), { dateStyle: "medium", timeStyle: "short" }) }) : t("none")}</p>
      {code ? (
        <>
          <p className="text-sm font-bold text-kin">{t("generated")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={() => void copy("href")}>
              {t("copyBookmarklet")}
            </Button>
            <Button type="button" onClick={() => void copy("console")}>
              {t("copyConsole")}
            </Button>
          </div>
          {manual && (
            <div className="flex flex-col gap-1">
              <label htmlFor={manualId} className="text-sm font-bold">
                {t(manual === "href" ? "manualBookmarklet" : "manualConsole")}
              </label>
              <textarea
                id={manualId}
                readOnly
                rows={4}
                value={manual === "href" ? code.href : code.console}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} py-2 text-xs break-all`}
              />
            </div>
          )}
        </>
      ) : (
        <Button type="button" variant="primary" disabled={pending} onClick={generate} className="w-full sm:w-fit">
          {issuedAt !== null ? t("regenerate") : t("generate")}
        </Button>
      )}
      <p role="status" className="text-sm text-text-muted">
        {copied === "href" ? t("copiedBookmarklet") : copied === "console" ? t("copiedConsole") : copied === "error" ? t("copyFailed") : ""}
      </p>
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {tError(error)}
        </p>
      )}
    </section>
  );
}
