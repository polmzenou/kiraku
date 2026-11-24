import type { StepState } from "@/lib/referral/steps";
import { STEP_KANJI } from "./StepCards";

const KNOT: Record<StepState, string> = {
  DONE: "bg-shu-btn text-washi-paper border-shu-btn",
  NEXT: "border-shu text-shu bg-bg ring-2 ring-shu/30",
  HELD: "border-kin text-kin bg-bg",
  MISSED: "border-border text-text-muted bg-surface-2 line-through",
  LOCKED: "border-border text-text-muted bg-surface-2",
};

/** Les quatre nœuds d'un filleul, reliés par le fil rouge (rempli jusqu'à la dernière étape atteinte). */
export function StepKnots({ states, size = "sm", label }: { states: readonly StepState[]; size?: "sm" | "md"; label: string }) {
  const knot = size === "sm" ? "size-6 text-[11px]" : "size-9 text-base";
  return (
    <span role="img" aria-label={label} className="flex items-center">
      {states.map((s, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span aria-hidden="true" className={`h-0.5 ${size === "sm" ? "w-2.5" : "w-4"} ${s === "DONE" ? "bg-shu" : "bg-border"}`} />}
          <span aria-hidden="true" lang="ja" className={`flex ${knot} items-center justify-center rounded-full border font-seal ${KNOT[s]}`}>
            {STEP_KANJI[i]}
          </span>
        </span>
      ))}
    </span>
  );
}
