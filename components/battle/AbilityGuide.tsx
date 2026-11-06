import { useFormatter, useTranslations } from "next-intl";
import { chargeParams, keywordParams, techniqueParams, ultimateParams } from "@/lib/battle/ability-params";
import type { BattleRules } from "@/lib/battle/config";
import { KEYWORDS, TECHNIQUES, ULTIMATES, type Keyword, type Technique, type Ultimate } from "@/lib/battle/types";
import { SectionTitle } from "../SectionTitle";

export type AbilityRules = Pick<BattleRules, "keywordValues" | "techniques" | "synergyAtkPct" | "ultimateRarities" | "ultimateCharge" | "ultimates">;

/** Nom d'une rareté (registre injecté dans les messages), ou sa clé si elle n'a pas de traduction. */
export function useRarityName() {
  const t = useTranslations("rarity");
  return (r: string) => (t.has(r) ? t(r) : r);
}

/**
 * Passifs puis techniques, avec les valeurs en vigueur (GameSetting). `inTeam` marque ce que
 * l'équipe en cours de choix possède déjà (choix d'équipe).
 */
export function AbilityLists({
  rules,
  inTeam,
  className = "grid gap-4 md:grid-cols-2",
}: {
  rules: AbilityRules;
  inTeam?: {
    keywords: ReadonlySet<Keyword>;
    techniques: ReadonlySet<Technique>;
    ultimates?: ReadonlySet<Ultimate>;
  };
  className?: string;
}) {
  const t = useTranslations("battle");
  const format = useFormatter();
  const rarityName = useRarityName();
  const k = rules.keywordValues;
  const mark = (on: boolean | undefined) =>
    on && (
      <span className="inline-flex items-center gap-1 rounded-full bg-kin/15 px-1.5 text-[11px] font-bold text-kin">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-kin" />
        {t("team.inTeam")}
      </span>
    );

  return (
    <div className={className}>
      <article className="flex flex-col gap-2 lacquer rounded-card p-4">
        <h3 className="font-heading text-lg font-extrabold text-kin">{t("abilities.passives")}</h3>
        <p className="text-xs text-text-muted">{t("abilities.passivesHint")}</p>
        <dl className="flex flex-col gap-2 text-sm">
          {KEYWORDS.map((kw) => (
            <div key={kw}>
              <dt className="flex flex-wrap items-center gap-2 font-bold">
                {t(`keywords.${kw}.name`)}
                {mark(inTeam?.keywords.has(kw))}
              </dt>
              <dd className="text-text-muted">
                {t(`keywords.${kw}.desc`, keywordParams(kw, k))}
              </dd>
            </div>
          ))}
        </dl>
      </article>

      <article className="flex flex-col gap-2 lacquer rounded-card p-4">
        <h3 className="font-heading text-lg font-extrabold text-shu">{t("abilities.techniques")}</h3>
        <p className="text-xs text-text-muted">{t("abilities.techniquesHint")}</p>
        <dl className="flex flex-col gap-2 text-sm">
          {TECHNIQUES.map((tech) => {
            const { cost, value } = rules.techniques[tech];
            return (
              <div key={tech}>
                <dt className="flex items-baseline justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {t(`techniques.${tech}.name`)}
                    {mark(inTeam?.techniques.has(tech))}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">{t("board.orbs", { count: cost })}</span>
                </dt>
                <dd className="text-text-muted">
                  {t(`techniques.${tech}.desc`, techniqueParams(value, k, (n) => format.number(n)))}
                </dd>
              </div>
            );
          })}
        </dl>
      </article>

      <article className="flex flex-col gap-2 lacquer rounded-card p-4">
        <h3 className="font-heading text-lg font-extrabold text-kin">{t("abilities.ultimates")}</h3>
        <p className="text-xs text-text-muted">
          {rules.ultimateRarities.length > 0
            ? t("abilities.ultimatesHint", { rarities: format.list(rules.ultimateRarities.map(rarityName), { type: "conjunction" }) })
            : t("abilities.ultimatesOff")}{" "}
          {t("ultimates.charge", chargeParams(rules.ultimateCharge))}
        </p>
        <dl className="flex flex-col gap-2 text-sm">
          {ULTIMATES.map((u) => (
            <div key={u}>
              <dt className="flex flex-wrap items-center gap-2 font-bold">
                {t(`ultimates.${u}.name`)}
                {mark(inTeam?.ultimates?.has(u))}
              </dt>
              <dd className="text-text-muted">{t(`ultimates.${u}.desc`, ultimateParams(rules.ultimates[u], (n) => format.number(n)))}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
}

/** Lexique des passifs, techniques et ultis de la page Combat. */
export function AbilityGuide({ rules }: { rules: AbilityRules }) {
  const t = useTranslations("battle");
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={t("abilities.title")} subtitle={t("abilities.intro")} />
      <AbilityLists rules={rules} />
    </section>
  );
}
