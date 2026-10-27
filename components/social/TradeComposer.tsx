"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Rarity } from "@/lib/catalog/rarity";
import type { CollectionItem } from "@/lib/collection/view";
import { proposeTradeAction } from "@/server/actions/trades";
import { CardPickGrid } from "../collection/CardPickGrid";
import { OwnedBadge } from "../collection/OwnedBadge";
import { Fuda } from "../fuda/Fuda";
import { Button } from "../ui/Button";
import { NoteField } from "../ui/NoteField";
import { Sheet } from "../ui/Sheet";

type Step = "want" | "offer" | "review" | "sent";

/**
 * Proposer un échange à un ami, en trois temps : la carte voulue dans sa collection, puis une ou
 * plusieurs des siennes en contrepartie, puis le récap. L'ami choisira l'une d'elles en acceptant.
 */
export function TradeComposer({ username, name, maxOffered, allowedRarities, onClose }: {
  username: string;
  name: string;
  maxOffered: number;
  allowedRarities: Rarity[];
  onClose: () => void;
}) {
  const t = useTranslations("trades.compose");
  const tErrors = useTranslations("trades.errors");
  const [step, setStep] = useState<Step>("want");
  const [wanted, setWanted] = useState<CollectionItem | null>(null);
  const [offered, setOffered] = useState<CollectionItem[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const offeredIds = new Set(offered.map((c) => c.cardId));

  const toggleOffer = (card: CollectionItem) => {
    setError(null);
    setOffered((current) =>
      current.some((c) => c.cardId === card.cardId)
        ? current.filter((c) => c.cardId !== card.cardId)
        : current.length >= maxOffered
          ? current
          : [...current, card],
    );
  };

  const send = () => {
    if (!wanted || offered.length === 0) return;
    startTransition(async () => {
      try {
        const res = await proposeTradeAction({ username, wantedCardId: wanted.cardId, offeredCardIds: offered.map((c) => c.cardId), note });
        if (!res.ok) setError(tErrors(res.error, { max: maxOffered }));
        else setStep("sent");
      } catch {
        setError(tErrors("UNAVAILABLE", { max: maxOffered }));
      }
    });
  };

  const title = step === "want" ? t("wantTitle", { name }) : step === "offer" ? t("offerTitle") : t("reviewTitle");

  return (
    <Sheet open onClose={onClose} title={title} wide>
      <ol className="flex gap-1 text-xs font-bold" aria-label={t("stepsLabel")}>
        {(["want", "offer", "review"] as const).map((s, i) => (
          <li
            key={s}
            aria-current={step === s ? "step" : undefined}
            className="flex-1 rounded-pill border border-border px-2 py-1 text-center text-text-muted aria-[current=step]:border-shu aria-[current=step]:text-text"
          >
            {i + 1}. {t(`steps.${s}`)}
          </li>
        ))}
      </ol>

      {step === "want" && (
        <>
          <p className="text-sm text-text-muted">{t("wantHint", { name })}</p>
          <CardPickGrid
            username={username}
            allowed={allowedRarities}
            selected={wanted ? new Set([wanted.cardId]) : new Set()}
            pickLabel={(card) => t("pickWanted", { card })}
            onPick={(card) => {
              setWanted(card);
              setOffered((current) => current.filter((c) => c.cardId !== card.cardId));
              setStep("offer");
            }}
          />
        </>
      )}

      {step === "offer" && wanted && (
        <>
          <p className="text-sm text-text-muted">{t("offerHint", { max: maxOffered })}</p>
          <CardPickGrid
            selected={offeredIds}
            allowed={allowedRarities}
            disabled={new Set([wanted.cardId])}
            pickLabel={(card) => t("pickOffered", { card })}
            onPick={toggleOffer}
          />
          <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-border bg-bg px-4 py-3 md:-mx-6 md:px-6">
            <Button type="button" onClick={() => setStep("want")}>
              {t("back")}
            </Button>
            <span className="text-sm tabular-nums text-text-muted">{t("offeredCount", { count: offered.length, max: maxOffered })}</span>
            <Button type="button" variant="primary" disabled={offered.length === 0} onClick={() => setStep("review")}>
              {t("next")}
            </Button>
          </div>
        </>
      )}

      {step === "review" && wanted && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[10rem_auto_1fr] md:items-center">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold tracking-wide text-text-muted">{t("youGet")}</p>
              <div className="w-32">
                <Fuda
                  card={wanted}
                  series={wanted.series}
                  size="sm"
                  tilt={false}
                  corner={wanted.viewerOwns && <OwnedBadge />}
                />
              </div>
            </div>
            <span aria-hidden="true" lang="ja" className="font-seal text-2xl text-shu md:text-center">
              換
            </span>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold tracking-wide text-text-muted">{t("theyChoose", { name })}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {offered.map((c) => (
                  <li key={c.cardId}>
                    <Fuda card={c} series={c.series} size="sm" tilt={false} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <NoteField label={t("note")} placeholder={t("notePlaceholder", { name })} value={note} onChange={setNote} disabled={pending} />
          <p className="text-xs text-text-muted">{t("rules")}</p>
          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setStep("offer")} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="primary" onClick={send} disabled={pending}>
              {pending ? t("sending") : t("send")}
            </Button>
          </div>
        </div>
      )}

      {step === "sent" && (
        <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
          <span aria-hidden="true" lang="ja" className="font-seal text-4xl text-shu">
            換
          </span>
          <p>{t("sent", { name })}</p>
          <Button type="button" variant="primary" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
