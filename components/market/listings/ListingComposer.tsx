"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { CardView } from "@/lib/boosters/view";
import type { CollectionItem } from "@/lib/collection/view";
import { createListingAction } from "@/server/actions/listings";
import { CardPickGrid } from "../../collection/CardPickGrid";
import { Fuda } from "../../fuda/Fuda";
import { Button } from "../../ui/Button";
import { NoteField } from "../../ui/NoteField";
import { Sheet } from "../../ui/Sheet";
import { WantPickGrid } from "./WantPickGrid";

type Step = "give" | "want" | "review" | "sent";

/**
 * Publier une annonce d'échange, en trois temps : la carte donnée (dans sa collection), puis jusqu'à
 * `maxWants` cartes demandées (parmi celles qu'on n'a pas), puis le récap avec un commentaire facultatif.
 */
export function ListingComposer({ maxWants, onClose }: { maxWants: number; onClose: () => void }) {
  const t = useTranslations("listings.compose");
  const tErrors = useTranslations("listings.errors");
  const [step, setStep] = useState<Step>("give");
  const [give, setGive] = useState<CollectionItem | null>(null);
  const [wants, setWants] = useState<CardView[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wantIds = new Set(wants.map((c) => c.cardId));

  const toggleWant = (card: CardView) => {
    setError(null);
    setWants((current) =>
      current.some((c) => c.cardId === card.cardId)
        ? current.filter((c) => c.cardId !== card.cardId)
        : current.length >= maxWants
          ? current
          : [...current, card],
    );
  };

  const publish = () => {
    if (!give || wants.length === 0) return;
    startTransition(async () => {
      try {
        const res = await createListingAction({ cardId: give.cardId, wantedCardIds: wants.map((c) => c.cardId), note });
        if (!res.ok) setError(tErrors(res.error as "UNAVAILABLE", { max: maxWants }));
        else setStep("sent");
      } catch {
        setError(tErrors("UNAVAILABLE", { max: maxWants }));
      }
    });
  };

  const title = step === "give" ? t("giveTitle") : step === "want" ? t("wantTitle") : t("reviewTitle");

  return (
    <Sheet open onClose={onClose} title={title} wide>
      {step !== "sent" && (
        <ol className="flex gap-1 text-xs font-bold" aria-label={t("stepsLabel")}>
          {(["give", "want", "review"] as const).map((s, i) => (
            <li
              key={s}
              aria-current={step === s ? "step" : undefined}
              className="flex-1 rounded-pill border border-border px-2 py-1 text-center text-text-muted aria-[current=step]:border-shu aria-[current=step]:text-text"
            >
              {i + 1}. {t(`steps.${s}`)}
            </li>
          ))}
        </ol>
      )}

      {step === "give" && (
        <>
          <p className="text-sm text-text-muted">{t("giveHint")}</p>
          <CardPickGrid
            selected={give ? new Set([give.cardId]) : new Set()}
            pickLabel={(card) => t("pickGive", { card })}
            onPick={(card) => {
              setGive(card);
              setWants((current) => current.filter((c) => c.cardId !== card.cardId));
              setStep("want");
            }}
          />
        </>
      )}

      {step === "want" && give && (
        <>
          <p className="text-sm text-text-muted">{t("wantHint", { max: maxWants })}</p>
          <WantPickGrid selected={wantIds} onPick={toggleWant} />
          <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-border bg-bg px-4 py-3 md:-mx-6 md:px-6">
            <Button type="button" onClick={() => setStep("give")}>
              {t("back")}
            </Button>
            <span className="text-sm tabular-nums text-text-muted">{t("wantCount", { count: wants.length, max: maxWants })}</span>
            <Button type="button" variant="primary" disabled={wants.length === 0} onClick={() => setStep("review")}>
              {t("next")}
            </Button>
          </div>
        </>
      )}

      {step === "review" && give && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[10rem_auto_1fr] md:items-center">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold tracking-wide text-text-muted">{t("youGive")}</p>
              <div className="w-32">
                <Fuda card={give} series={give.series} size="sm" tilt={false} />
              </div>
            </div>
            <span aria-hidden="true" lang="ja" className="font-seal text-2xl text-shu md:text-center">
              換
            </span>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold tracking-wide text-text-muted">{t("againstOne")}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {wants.map((c) => (
                  <li key={c.cardId}>
                    <Fuda card={c} series={c.series} size="sm" tilt={false} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <NoteField label={t("note")} placeholder={t("notePlaceholder")} value={note} onChange={setNote} disabled={pending} />
          <p className="text-xs text-text-muted">{t("rules")}</p>
          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setStep("want")} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="primary" onClick={publish} disabled={pending}>
              {pending ? t("publishing") : t("publish")}
            </Button>
          </div>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
          <span aria-hidden="true" lang="ja" className="font-seal text-4xl text-shu">
            換
          </span>
          <p>{t("published")}</p>
          <Button type="button" variant="primary" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
