import { useTranslations } from "next-intl";
import type { SelfView, StepGifts } from "@/server/referral/queries";
import { LotGifts } from "./LotGifts";
import { STEP_KANJI, stepNo, type StepConditions } from "./StepCards";
import { StepMeter } from "./StepMeter";

/** Vue du filleul (design « bienvenue d'abord ») : ses quatre étapes en marches, ses cadeaux, où il en est. */
export function SelfStairs({ self, steps, conditions, timeZone }: { self: SelfView; steps: StepGifts[]; conditions: StepConditions; timeZone: string }) {
  const t = useTranslations("referralV2.self");
  const tSteps = useTranslations("referralV2.steps");
  const done = self.steps.filter((s) => s.state === "DONE").length;
  return (
    <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="cadeaux-filleul">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cadeaux-filleul" className="font-title text-lg font-bold">{t("giftsTitle")}</h2>
        <span className="text-xs text-text-muted">{t("stepsDone", { count: done })}</span>
      </div>
      {self.status !== "ACTIVE" && (
        <p className="flex gap-2 rounded-card border border-kin/50 bg-kin/10 p-3 text-sm">
          <span aria-hidden="true" lang="ja" className="font-seal text-kin">{self.status === "HELD" ? "待" : "止"}</span>
          <span>{t(self.status === "HELD" ? "held" : "revoked")}</span>
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {self.steps.map((s, i) => (
          <li key={i} className={`flex gap-3 rounded-card border p-3 ${s.state === "DONE" ? "border-hisui/50" : s.state === "NEXT" ? "border-shu/60" : "border-border"}`}>
            <span
              aria-hidden="true"
              lang="ja"
              className={`flex size-9 shrink-0 items-center justify-center rounded-full border font-seal ${s.state === "DONE" ? "border-shu-btn bg-shu-btn text-washi-paper" : "border-border text-text-muted"}`}
            >
              {STEP_KANJI[i]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm font-bold">
                {tSteps(`${stepNo(i + 1)}.name`)} · <span className="font-normal text-text-muted">{tSteps(`${stepNo(i + 1)}.you`, conditions)}</span>
              </span>
              <LotGifts lot={steps[i]?.referee ?? null} compact />
              {s.state === "DONE" && <span className="self-start rounded-sm bg-hisui/15 px-2 text-[11px] font-bold text-hisui">{t("received")}</span>}
              {s.state === "HELD" && s.at && <span className="self-start rounded-sm bg-kin/15 px-2 text-[11px] font-bold text-kin">{t("waiting")}</span>}
              {s.state === "MISSED" && <span className="self-start rounded-sm bg-surface-2 px-2 text-[11px] font-bold text-text-muted">{t("missed")}</span>}
              {s.state === "NEXT" && <StepMeter row={s} step={i + 1} timeZone={timeZone} />}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-text-muted">{t("paidAlone")}</p>
    </section>
  );
}
