"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { ShowcaseLayoutId } from "@/lib/showcase/layouts";
import { enterShowcaseEventAction, withdrawShowcaseEntryAction, type ShowcaseEventResult } from "@/server/actions/showcase-event";

export type PickableShowcase = { id: string; name: string | null; order: number; layout: ShowcaseLayoutId; count: number };

/** Lance une action de l'event et renvoie le message d'erreur traduit (null si tout va bien). */
function useEventAction() {
  const t = useTranslations("event.errors");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<ShowcaseEventResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      let result: ShowcaseEventResult;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: "UNAVAILABLE" };
      }
      if (result.ok) onDone?.();
      else setError(t(result.error));
    });
  }
  return { pending, error, run };
}

/**
 * Choix de la vitrine à engager : une seule, photographiée au moment de la confirmation. Les vitrines
 * sous le minimum de cartes sont grisées.
 */
export function EntryPicker({ showcases, minCards, profileHref }: { showcases: readonly PickableShowcase[]; minCards: number; profileHref: string }) {
  const t = useTranslations("event.participation");
  const tShowcase = useTranslations("showcase");
  const name = useId();
  const firstReady = showcases.find((s) => s.count >= minCards)?.id ?? null;
  const [chosen, setChosen] = useState<string | null>(firstReady);
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useEventAction();

  if (showcases.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-muted">{t("noShowcase")}</p>
        <ButtonLink href={profileHref} prefetch={false}>
          {t("createShowcase")}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-2 text-sm font-bold">{t("pick")}</legend>
        {showcases.map((s) => {
          const ready = s.count >= minCards;
          return (
            <label
              key={s.id}
              className={`flex min-h-11 items-center gap-3 rounded-control border px-3 py-2 ${chosen === s.id ? "border-shu bg-shu/10" : "border-border"} ${ready ? "cursor-pointer" : "opacity-50"}`}
            >
              <input
                type="radio"
                name={name}
                value={s.id}
                checked={chosen === s.id}
                disabled={!ready}
                onChange={() => {
                  setChosen(s.id);
                  setConfirming(false);
                }}
                className="size-5 shrink-0"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold">{s.name || tShowcase("untitled", { n: s.order + 1 })}</span>
                <span className="text-xs text-text-muted">
                  {tShowcase(`layouts.${s.layout}.name`)} · {t("cards", { count: s.count })}
                  {!ready && ` · ${t("tooFew", { min: minCards })}`}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {confirming && chosen ? (
        <div className="flex flex-col gap-3 rounded-control border border-kin/50 bg-kin/10 p-3">
          <p className="text-sm">{t("confirmEnter")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending} onClick={() => run(() => enterShowcaseEventAction({ showcaseId: chosen }), () => setConfirming(false))}>
              {t("confirm")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" className="self-start" disabled={!chosen || pending} onClick={() => setConfirming(true)}>
          {t("enter")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {error}
        </p>
      )}
    </div>
  );
}

/** Retirer sa participation, avec confirmation : la vitrine quitte l'event et perd ses votes. */
export function WithdrawButton() {
  const t = useTranslations("event.participation");
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useEventAction();
  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-control border border-shu/40 bg-shu/10 p-3">
          <p className="text-sm">{t("confirmWithdraw")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={pending} onClick={() => run(() => withdrawShowcaseEntryAction({}), () => setConfirming(false))}>
              {t("withdraw")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" className="self-start" onClick={() => setConfirming(true)}>
          {t("withdraw")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-shu">
          {error}
        </p>
      )}
    </div>
  );
}
