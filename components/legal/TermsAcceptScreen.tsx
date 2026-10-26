"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { acceptTermsAction } from "@/server/actions/data";
import { Button } from "../ui/Button";

/** Écran d'acceptation des CGU (première fois après une inscription Discord, ou nouvelle version). */
export function TermsAcceptScreen({ version, firstTime }: { version: number; firstTime: boolean }) {
  const t = useTranslations("legal.accept");
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptTermsAction({ version });
      if (result.ok) return;
      if (result.error === "STALE") router.refresh();
      else setError(t(result.error === "RATE_LIMITED" ? "rateLimited" : "error"));
    });
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem-var(--mobile-nav-height))] w-full max-w-xl flex-col justify-center gap-5 px-4 py-8">
      <span aria-hidden="true" lang="ja" className="font-seal text-4xl text-shu">
        約
      </span>
      <h1 className="font-heading text-2xl font-extrabold">{firstTime ? t("titleFirst") : t("titleUpdated")}</h1>
      <p className="text-text-muted">{firstTime ? t("bodyFirst") : t("bodyUpdated", { version })}</p>
      <ul className="flex flex-col gap-1">
        <li>
          <Link href="/cgu" className="inline-flex min-h-11 items-center font-medium text-ai underline underline-offset-4">
            {t("readTerms")}
          </Link>
        </li>
        <li>
          <Link href="/confidentialite" className="inline-flex min-h-11 items-center font-medium text-ai underline underline-offset-4">
            {t("readPrivacy")}
          </Link>
        </li>
      </ul>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 choice shrink-0 "
        />
        <span>{t("checkbox")}</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <Button type="button" variant="primary" disabled={!checked || pending} onClick={accept} className="min-h-12 text-base">
        {pending ? t("pending") : t("submit")}
      </Button>
    </main>
  );
}
