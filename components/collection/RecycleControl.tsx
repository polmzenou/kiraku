"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recycleCardAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { useCollectionStore } from "./CollectionStore";

/**
 * Recyclage depuis la fiche : choisir combien de doublons recycler (1 à N), voir le gain, confirmer.
 * Le serveur choisit les exemplaires (jamais celui en vitrine) et refuse si l'écran n'est plus à jour.
 */
export function RecycleControl({
  cardId,
  copies,
  recyclable,
  unitValue,
}: {
  cardId: string;
  copies: number;
  recyclable: number;
  unitValue: number;
}) {
  const t = useTranslations("collection.card");
  const { patch } = useCollectionStore();
  const [count, setCount] = useState(recyclable);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (recyclable === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">{t("noDuplicates")}</p>
        {message && (
          <p role="status" className="text-sm">
            {message.text}
          </p>
        )}
      </div>
    );
  }

  const n = Math.min(Math.max(1, count), recyclable);
  const gain = n * unitValue;

  const recycle = () =>
    startTransition(async () => {
      try {
        const res = await recycleCardAction({ cardId, count: n });
        setConfirming(false);
        if (!res.ok) {
          setMessage({ tone: "error", text: t(`errors.${res.error}`) });
          return;
        }
        patch(cardId, { copies: copies - res.recycled, recyclable: recyclable - res.recycled });
        setMessage({ tone: "ok", text: t("recycled", { count: res.recycled, zeni: res.gain }) });
        setCount(recyclable - res.recycled);
      } catch {
        setMessage({ tone: "error", text: t("errors.UNAVAILABLE") });
      }
    });

  const stepper = "inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface-2 text-xl disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t("less")}
          disabled={n <= 1 || pending}
          onClick={() => {
            setCount(n - 1);
            setConfirming(false);
          }}
          className={stepper}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output aria-live="polite" className="min-w-16 text-center text-lg font-bold tabular-nums">
          {t("count", { count: n, max: recyclable })}
        </output>
        <button
          type="button"
          aria-label={t("more")}
          disabled={n >= recyclable || pending}
          onClick={() => {
            setCount(n + 1);
            setConfirming(false);
          }}
          className={stepper}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      {confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="primary" onClick={recycle} disabled={pending}>
            {t("confirm", { zeni: gain })}
          </Button>
        </div>
      ) : (
        <Button type="button" variant="primary" onClick={() => setConfirming(true)} disabled={pending}>
          {t("recycle", { count: n, zeni: gain })}
        </Button>
      )}
      <p className="text-xs text-text-muted">{t("keepOne")}</p>
      {message && (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-text" : "text-shu"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
