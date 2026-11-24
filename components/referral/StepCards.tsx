"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { StepGifts } from "@/server/referral/queries";
import { LotGifts } from "./LotGifts";
import { STEP_KANJI, stepNo, type StepConditions } from "./step-meta";

/**
 * Ce que vous gagnez (design « fuda à retourner ») : une carte par étape ; retournée, elle montre les cadeaux de chacun
 * des deux côtés. Les deux faces partagent la même case de grille : la carte prend la hauteur de la plus haute.
 * `multiplier` : ×2 de l'Ennichi sur les étapes 1 et 2.
 */
export function StepCards({ steps, conditions, multiplier = 1 }: { steps: StepGifts[]; conditions: StepConditions; multiplier?: number }) {
  const t = useTranslations("referralV2.steps");
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="grid grid-cols-2 gap-3">
      {steps.map((s, i) => {
        const back = open === i;
        const m = i < 2 ? multiplier : 1;
        const badge = m > 1 && <span className="absolute right-2 top-2 rounded-sm bg-shu-btn px-1.5 text-[11px] font-bold text-washi-paper">×{m}</span>;
        return (
          <li key={s.step} className="flex perspective-[900px]">
            {/* Pas d'aria-label : les deux faces sont lues, cadeaux compris */}
            <button
              type="button"
              aria-pressed={back}
              onClick={() => setOpen(back ? null : i)}
              className={`grid min-h-40 w-full text-left transform-3d motion-safe:transition-transform motion-safe:duration-500 ${back ? "rotate-y-180" : ""}`}
            >
              <span className="relative flex flex-col gap-1 rounded-card border border-border bg-[linear-gradient(160deg,var(--color-surface),var(--color-surface-2))] p-3 backface-hidden [grid-area:1/1]">
                {badge}
                <span aria-hidden="true" lang="ja" className="font-seal text-3xl text-shu">{STEP_KANJI[i]}</span>
                <span className="font-title text-base font-bold">{t(`${stepNo(s.step)}.name`)}</span>
                <span className="text-xs text-text-muted">{t(`${stepNo(s.step)}.say`, conditions)}</span>
                <span aria-hidden="true" className="mt-auto pt-1 text-[11px] text-ai">{t("tapHint")}</span>
              </span>
              <span className="relative flex flex-col gap-1.5 rounded-card border border-kin/50 bg-surface p-3 backface-hidden rotate-y-180 [grid-area:1/1]">
                {badge}
                <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{t("you")}</span>
                <LotGifts lot={s.referrerTotal} multiplier={m} compact />
                <span className="mt-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">{t("friend")}</span>
                <LotGifts lot={s.referee} multiplier={m} compact />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
