import { useFormatter, useTranslations } from "next-intl";
import type { BattleRules } from "@/lib/battle/config";
import { KEYWORDS, TECHNIQUES, type Keyword } from "@/lib/battle/types";
import { SectionTitle } from "../SectionTitle";

/** Lexique des passifs et techniques, avec les valeurs en vigueur (GameSetting). */
export function AbilityGuide({ rules }: { rules: Pick<BattleRules, "keywordValues" | "techniques"> }) {
  const t = useTranslations("battle");
  const format = useFormatter();
  const k = rules.keywordValues;
  const kwPct: Record<Keyword, number> = { TAUNT: 0, BARRIER: 0, FLURRY: 0, POISON: k.poisonPct, RIPOSTE: k.ripostePct, LAST_WILL: k.lastWillHealPct, REVIVE: k.revivePct };

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={t("abilities.title")} subtitle={t("abilities.intro")} />
      <div className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col gap-2 lacquer rounded-card p-4">
          <h3 className="font-title text-base font-bold text-kin">{t("abilities.passives")}</h3>
          <p className="text-xs text-text-muted">{t("abilities.passivesHint")}</p>
          <dl className="flex flex-col gap-2 text-sm">
            {KEYWORDS.map((kw) => (
              <div key={kw}>
                <dt className="font-bold">{t(`keywords.${kw}.name`)}</dt>
                <dd className="text-text-muted">{t(`keywords.${kw}.desc`, { pct: kwPct[kw], turns: k.poisonTurns })}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="flex flex-col gap-2 lacquer rounded-card p-4">
          <h3 className="font-title text-base font-bold text-shu">{t("abilities.techniques")}</h3>
          <p className="text-xs text-text-muted">{t("abilities.techniquesHint")}</p>
          <dl className="flex flex-col gap-2 text-sm">
            {TECHNIQUES.map((tech) => {
              const { cost, value } = rules.techniques[tech];
              return (
                <div key={tech}>
                  <dt className="flex items-baseline justify-between gap-2">
                    <span className="font-bold">{t(`techniques.${tech}.name`)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-text-muted">{t("board.orbs", { count: cost })}</span>
                  </dt>
                  <dd className="text-text-muted">{t(`techniques.${tech}.desc`, { mult: format.number(value / 100), pct: value })}</dd>
                </div>
              );
            })}
          </dl>
        </article>
      </div>
    </section>
  );
}
