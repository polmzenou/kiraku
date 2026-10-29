"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import type { FxLevel } from "@/lib/battle/choreography";
import { OUTCOME_KANJI } from "@/lib/battle/glyphs";
import "./sequences.css";

/**
 * Fin du combat : le kanji 勝, 負 ou 引 se trace au pinceau (trois bandes qui apparaissent de haut en
 * bas), puis la tablette du résultat monte. Un toucher passe au résultat ; directement en mouvement réduit.
 */
export function Outro({ outcome, reason, level, children }: { outcome: "victory" | "defeat" | "draw"; reason: string | null; level: FxLevel; children: ReactNode }) {
  const t = useTranslations("battle.result");
  const [phase, setPhase] = useState<"verdict" | "result">(level === "reduced" ? "result" : "verdict");
  useEffect(() => {
    if (phase !== "verdict") return;
    const id = setTimeout(() => setPhase("result"), 1_900);
    return () => clearTimeout(id);
  }, [phase]);
  const glyph = OUTCOME_KANJI[outcome];
  return (
    <div className="outro" data-outcome={outcome} data-phase={phase} onPointerDown={() => setPhase("result")}>
      <div className="outro-verdict">
        <span className="outro-kanji" aria-hidden="true" lang="ja">
          <i>{glyph}</i>
          <i>{glyph}</i>
          <i>{glyph}</i>
        </span>
        <b className="outro-label">{t(outcome === "victory" ? "WIN" : outcome === "defeat" ? "LOSS" : "DRAW")}</b>
        {reason && <span className="outro-reason">{reason}</span>}
      </div>
      {phase === "result" && <div className="outro-tablet">{children}</div>}
    </div>
  );
}
