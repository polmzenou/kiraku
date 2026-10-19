"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { EndReason, Side } from "@/lib/battle/types";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button, buttonClasses } from "../ui/Button";

/** Écran de fin : sceau de victoire ou de défaite, raison, Zeni gagnés, puis rejouer ou revoir. */
export function BattleResult({
  winner,
  mySide,
  reason,
  rewardZeni,
  onReplay,
  ranked,
}: {
  winner: Side | null;
  mySide: Side;
  reason: EndReason | null;
  rewardZeni: number;
  onReplay?: () => void;
  /** Bilan classé (emblème, PC) sous le résultat. */
  ranked?: ReactNode;
}) {
  const t = useTranslations("battle.result");
  const outcome = winner === null ? "DRAW" : winner === mySide ? "WIN" : "LOSS";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="battle-result-title" className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-bg p-6 text-center">
        <h2
          id="battle-result-title"
          className={`flex min-h-24 rotate-[-6deg] items-center justify-center rounded-md border-4 px-4 py-3 font-title text-3xl font-extrabold ${
            outcome === "WIN" ? "border-kin text-kin" : outcome === "LOSS" ? "border-shu text-shu" : "border-border text-text-muted"
          }`}
        >
          {t(outcome)}
        </h2>
        {reason && <p className="text-sm text-text-muted">{t(reason === "KO" && outcome === "LOSS" ? "reason.KO_LOSS" : `reason.${reason}`)}</p>}
        {ranked}
        {outcome === "WIN" && rewardZeni > 0 ? (
          <p className="flex items-center gap-2 text-lg font-bold tabular-nums text-kin">
            <ZeniCoin size={20} />
            {t("zeni", { amount: rewardZeni })}
          </p>
        ) : (
          <p className="text-xs text-text-muted">{t("noZeni")}</p>
        )}
        <p className="text-xs text-text-muted">{t("cardsBack")}</p>
        <div className="flex w-full flex-col gap-2">
          <Link href="/combat" className={buttonClasses("primary", "w-full")}>
            {t("again")}
          </Link>
          {onReplay && (
            <Button className="w-full" onClick={onReplay}>
              {t("replay")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
