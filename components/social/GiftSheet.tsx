"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { SealedKind } from "@/lib/boosters/draw";
import type { Rarity } from "@/lib/catalog/rarity";
import type { CollectionItem } from "@/lib/collection/view";
import { giftBoosterAction, giftCardAction, giftSealedAction } from "@/server/actions/social";
import { ZeniCoin } from "../layout/ZeniCoin";
import { ShowcasePicker } from "../profile/ShowcasePicker";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** Limites citées par les messages de refus (valeurs des réglages de l'admin). */
export type GiftLimits = {
  perDaySent: number;
  perDayReceived: number;
  minAccountAgeHours: number;
  minFriendshipHours: number;
  /** Sachets scellés : ancienneté du compte (jours) et nombre par semaine. */
  sealedMinAccountDays: number;
  sealedPerWeek: number;
};

/** Ce que la feuille doit savoir pour s'afficher ; le serveur revérifie tout au moment du cadeau. */
export type GiftInfo = {
  price: number;
  coins: number;
  remaining: number;
  limits: GiftLimits;
  /** Raretés qu'on peut offrir : le sélecteur ne montre que celles-ci. */
  allowedRarities: Rarity[];
  /** Sachets scellés tombés d'un tirage, encore offrables (le serveur revérifie les garde-fous). */
  sealed?: { id: string; kind: SealedKind }[];
};

type Choice = { kind: "card"; card: CollectionItem } | { kind: "booster" } | { kind: "sealed"; id: string; sealed: SealedKind } | null;

/**
 * Offrir à un ami : une carte de sa collection (le serveur choisit l'exemplaire, jamais celui
 * qu'on montre en vitrine s'il y en a un autre) ou un booster standard payé en Zeni.
 */
export function GiftSheet({ username, name, info, onClose }: { username: string; name: string; info: GiftInfo; onClose: () => void }) {
  const t = useTranslations("gifts");
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<Choice>(null);
  const [remaining, setRemaining] = useState(info.remaining);
  const [sealed, setSealed] = useState(info.sealed ?? []);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const values = { ...info.limits, name, price: info.price };

  const confirm = () => {
    if (!choice) return;
    startTransition(async () => {
      try {
        const res =
          choice.kind === "card"
            ? await giftCardAction({ username, cardId: choice.card.cardId })
            : choice.kind === "sealed"
              ? await giftSealedAction({ username, drop: choice.id })
              : await giftBoosterAction({ username });
        if (!res.ok) {
          setResult({ tone: "error", text: t(`errors.${res.error}`, values) });
          return;
        }
        setRemaining((n) => Math.max(0, n - 1));
        if (choice.kind === "sealed") setSealed((list) => list.filter((s) => s.id !== choice.id));
        setResult({
          tone: "ok",
          text:
            choice.kind === "card"
              ? t("sentCard", { card: choice.card.name, name })
              : choice.kind === "sealed"
                ? t(choice.sealed === "divin" ? "sentSealedDivin" : "sentSealedApocalypse", { name })
                : t("sentBooster", { name }),
        });
        setChoice(null);
      } catch {
        setResult({ tone: "error", text: t("errors.UNAVAILABLE", values) });
      }
    });
  };

  if (picking) {
    return (
      <ShowcasePicker
        title={t("pickTitle", { name })}
        pickLabel={(card) => t("pickCard", { card })}
        shownIds={new Set()}
        allowed={info.allowedRarities}
        onClose={() => setPicking(false)}
        onPick={(card) => {
          setPicking(false);
          setChoice({ kind: "card", card });
          setResult(null);
        }}
      />
    );
  }

  return (
    <Sheet open onClose={onClose} title={t("title", { name })}>
      <p className="text-sm text-text-muted">{t("remaining", { count: remaining, max: info.limits.perDaySent, name })}</p>

      {choice ? (
        <div className="flex flex-col gap-3 rounded-card border border-shu bg-surface p-4" aria-live="polite">
          <p>
            {choice.kind === "card"
              ? t("confirmCard", { card: choice.card.name, name })
              : choice.kind === "sealed"
                ? t(choice.sealed === "divin" ? "confirmSealedDivin" : "confirmSealedApocalypse", { name })
                : t("confirmBooster", { name, price: info.price })}
          </p>
          {choice.kind === "booster" && (
            <p className="flex items-center gap-1.5 text-sm text-text-muted">
              <ZeniCoin size={14} />
              {t("balance", { amount: info.coins })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setChoice(null)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="primary" onClick={confirm} disabled={pending}>
              {pending ? t("sending") : t("confirm")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" disabled={remaining <= 0} onClick={() => setPicking(true)} className="min-h-14">
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              札
            </span>
            {t("card")}
          </Button>
          <Button
            type="button"
            disabled={remaining <= 0 || info.coins < info.price}
            onClick={() => {
              setChoice({ kind: "booster" });
              setResult(null);
            }}
            className="min-h-14"
          >
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              袋
            </span>
            {t("booster", { price: info.price })}
          </Button>
          {/* Sachets scellés : un bouton par sachet offrable (au plus quelques-uns) */}
          {sealed.slice(0, 4).map((s) => (
            <Button
              key={s.id}
              type="button"
              disabled={remaining <= 0}
              onClick={() => {
                setChoice({ kind: "sealed", id: s.id, sealed: s.kind });
                setResult(null);
              }}
              className="min-h-14"
            >
              <span aria-hidden="true" lang="ja" className="font-seal text-shu">
                {s.kind === "divin" ? "天" : "滅"}
              </span>
              {t(s.kind === "divin" ? "sealedDivin" : "sealedApocalypse")}
            </Button>
          ))}
        </div>
      )}

      <p className="text-xs text-text-muted">{t("rules", values)}</p>

      {result && (
        <p role="status" className={`text-sm ${result.tone === "ok" ? "text-text" : "text-shu"}`}>
          {result.text}
        </p>
      )}
    </Sheet>
  );
}
