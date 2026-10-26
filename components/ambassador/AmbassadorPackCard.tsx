"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { claimAmbassadorPackAction, type AmbassadorPackResult } from "@/server/actions/ambassador";
import { Button } from "../ui/Button";

/** Pack hebdomadaire d'un ambassadeur, sur l'accueil : à réclamer, ou la date du prochain. */
export function AmbassadorPackCard({ status, count, boosterName, nextAt }: { status: "available" | "claimed"; count: number; boosterName: string; nextAt: Date }) {
  const t = useTranslations("ambassador.pack");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const claim = () =>
    startTransition(async () => {
      setError(null);
      let res: AmbassadorPackResult;
      try {
        res = await claimAmbassadorPackAction({});
      } catch {
        setError(t("errors.UNAVAILABLE"));
        return;
      }
      // Réussite : l'action rafraîchit la page, les boosters apparaissent dans « à ouvrir »
      if (!res.ok) setError(t(`errors.${res.error}`));
    });

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hisui bg-surface p-4" aria-labelledby="ambassador-pack">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" lang="ja" className="font-seal text-2xl text-hisui">
          使
        </span>
        <div className="min-w-0">
          <h2 id="ambassador-pack" className="font-title font-bold">
            {t("title")}
          </h2>
          <p className="text-sm text-text-muted">
            {status === "available"
              ? t("available", { count, name: boosterName })
              : t("claimed", { when: format.dateTime(nextAt, { weekday: "long", hour: "2-digit", minute: "2-digit" }) })}
          </p>
          {error && (
            <p role="alert" className="mt-1 text-sm text-shu">
              {error}
            </p>
          )}
        </div>
      </div>
      {status === "available" && (
        <Button type="button" variant="primary" onClick={claim} disabled={pending}>
          {pending ? t("claiming") : t("claim")}
        </Button>
      )}
    </section>
  );
}
