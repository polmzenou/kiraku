"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { SealedKind } from "@/lib/boosters/draw";
import { giftSealedAction } from "@/server/actions/social";
import { Button } from "../ui/Button";
import type { GiftLimits } from "./GiftSheet";

/**
 * « Offrir » sur une ligne de /amis?sachet=… : demande une confirmation, puis offre le sachet scellé.
 * Le serveur revérifie tout (propriété, sachet offrable, Discord, ancienneté, limite de la semaine).
 */
export function GiftSealedButton({
  username,
  name,
  drop,
  kind,
  limits,
}: {
  username: string;
  name: string;
  drop: string;
  kind: SealedKind;
  limits: GiftLimits;
}) {
  const t = useTranslations("gifts");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      try {
        const res = await giftSealedAction({ username, drop });
        setConfirming(false);
        setResult(
          res.ok
            ? { tone: "ok", text: t(kind === "divin" ? "sentSealedDivin" : "sentSealedApocalypse", { name }) }
            : { tone: "error", text: t(`errors.${res.error}`, { ...limits, name, price: 0 }) },
        );
      } catch {
        setResult({ tone: "error", text: t("errors.UNAVAILABLE", { ...limits, name, price: 0 }) });
      }
    });

  if (result) {
    return (
      <p role="status" className={`max-w-56 text-right text-xs ${result.tone === "ok" ? "text-text" : "text-shu"}`}>
        {result.text}
      </p>
    );
  }
  if (confirming) {
    return (
      <span className="flex gap-1.5">
        <Button type="button" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          {t("back")}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={send} disabled={pending}>
          {pending ? t("sending") : t("confirm")}
        </Button>
      </span>
    );
  }
  return (
    <Button type="button" size="sm" variant="primary" onClick={() => setConfirming(true)}>
      <span aria-hidden="true" lang="ja" className="font-seal">
        {kind === "divin" ? "天" : "滅"}
      </span>
      {t("offer")}
    </Button>
  );
}
