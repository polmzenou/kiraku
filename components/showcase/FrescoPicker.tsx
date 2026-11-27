"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { frescoProgress, type FrescoView } from "@/lib/fresco/view";
import { setShowcaseFrescoAction } from "@/server/actions/showcases";
import { FrescoMap } from "../fresco/FrescoView";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

const PICKER_ERRORS = ["NO_SESSION", "INVALID", "RATE_LIMITED", "NOT_FOUND", "NOT_OWNED"] as const;

/**
 * Choix de la fresque d'une vitrine, comme on choisit une carte : les fresques dont le joueur a au moins un
 * fragment, avec leur progression, ou aucune ; et la vue ouverte d'abord (cartes ou fresque).
 */
export function FrescoPicker({
  showcaseId,
  choices,
  current,
  first: initialFirst,
  onClose,
  onSaved,
}: {
  showcaseId: string;
  choices: readonly FrescoView[];
  current: string | null;
  first: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("fresco.picker");
  const [value, setValue] = useState<string | null>(current);
  const [first, setFirst] = useState(initialFirst);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await setShowcaseFrescoAction({ showcaseId, frescoId: value, first: value !== null && first }).catch(() => ({ ok: false as const, error: "UNAVAILABLE" as const }));
      if (!res.ok) {
        setError((PICKER_ERRORS as readonly string[]).includes(res.error) ? t(`errors.${res.error as (typeof PICKER_ERRORS)[number]}`) : t("errors.UNAVAILABLE"));
        return;
      }
      onSaved();
    });

  const option = (id: string | null, body: React.ReactNode) => (
    <label key={id ?? "none"} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-card border border-border bg-surface-2 p-2.5 has-[:checked]:border-kin has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ai">
      <input type="radio" name="fresco" className="choice" checked={value === id} onChange={() => setValue(id)} />
      {body}
    </label>
  );

  return (
    <Sheet open onClose={onClose} title={t("title")} wide>
      <p className="text-sm text-text-muted">{t("intro")}</p>
      {choices.length === 0 ? (
        <p className="rounded-card bg-surface-2 p-4 text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("title")}</legend>
          {option(null, <span className="font-bold">{t("none")}</span>)}
          {choices.map((f) => {
            const { owned, total, complete } = frescoProgress(f);
            return option(
              f.id,
              <>
                <FrescoMap cols={f.cols} rows={f.rows} owned={f.pieces.map((p) => p.position)} className="w-14 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-bold">{f.name}</span>
                  <span className={`text-xs tabular-nums ${complete ? "font-bold text-kin" : "text-text-muted"}`}>
                    {owned}/{total}
                  </span>
                </span>
              </>,
            );
          })}
        </fieldset>
      )}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" className="choice mt-1" checked={first && value !== null} disabled={value === null} onChange={(e) => setFirst(e.target.checked)} />
        <span>
          <span className="font-bold">{t("first")}</span>
          <span className="block text-xs text-text-muted">{t("firstHint")}</span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="button" variant="primary" onClick={save} disabled={pending || choices.length === 0}>
          {t("save")}
        </Button>
      </div>
    </Sheet>
  );
}
