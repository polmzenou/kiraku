import { useFormatter, useTranslations } from "next-intl";
import type { BoosterDefinition } from "@/lib/boosters/catalog";
import { contentsLabel } from "@/lib/boosters/catalog";
import { rarityIndex } from "@/lib/boosters/draw";
import type { RarityOdds } from "@/lib/boosters/odds";
import { RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import type { BoosterState } from "@/server/boosters/state";
import { RARITY_BG, usePercent } from "./format";
import { NextFreeIn } from "./NextFreeIn";
import { OpenLink } from "./OpenLink";
import { Sachet } from "./Sachet";

const CHANCE_ROWS: Rarity[] = ["RARE", "EPIC", "LEGENDARY", "MYTHIC"];

type Props = {
  booster: BoosterDefinition;
  slotFloors: readonly Rarity[];
  odds: RarityOdds;
  poolSize: number;
  state: BoosterState;
};

/** Panneau « Booster sélectionné » : contenu, garanties, compteurs, chances calculées et bouton Ouvrir. */
export function BoosterPanel({ booster, slotFloors, odds, poolSize, state }: Props) {
  const t = useTranslations("boosters");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const percent = usePercent();
  const name = t(`types.${booster.slug}.name`);
  const best = slotFloors.reduce((a, b) => (rarityIndex(b) > rarityIndex(a) ? b : a));

  const stat = (value: string, label: string, tone = "") => (
    <div className="flex min-w-0 flex-col gap-1 rounded-button bg-surface-2 p-3">
      <dd className={`font-title text-lg font-bold leading-none ${tone}`}>{value}</dd>
      <dt className="text-xs leading-snug text-text-muted">{label}</dt>
    </div>
  );

  return (
    <section aria-labelledby="selected-booster" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <span aria-hidden="true" lang="ja" className="font-seal text-base text-shu">
          選
        </span>
        {t("selected")}
      </p>

      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0">
          <Sachet theme={booster.theme} name={name} contents={contentsLabel(slotFloors.length)} />
        </div>
        <div className="min-w-0">
          <h2 id="selected-booster" className="font-title text-xl font-bold">
            {name}
          </h2>
          <p className="text-xs text-text-muted">{t(`types.${booster.slug}.tagline`)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {stat(String(slotFloors.length), t("cardsPerBooster"))}
        {stat(tRarity(best), t("guaranteed"), "text-ai")}
        {stat(format.number(state.pityLeft), t("pityLeft"), "text-shu")}
        {state.goldenIn !== null && stat(format.number(state.goldenIn), t("goldenLeft"), "text-kin")}
        {stat(format.number(poolSize), t("possible"))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">{t("composition")}</h3>
        <ol className="flex flex-wrap gap-1.5">
          {slotFloors.map((floor, i) => (
            <li
              key={i}
              title={t("slot", { n: i + 1, rarity: tRarity(floor) })}
              className={`inline-flex h-8 min-w-9 items-center justify-center gap-0.5 rounded-button px-2 font-seal text-base text-washi-paper ${RARITY_BG[floor]}`}
            >
              <span aria-hidden="true">{RARITY_SEAL[floor]}</span>
              {floor !== "COMMON" && <span aria-hidden="true">+</span>}
              <span className="sr-only">{t("slot", { n: i + 1, rarity: tRarity(floor) })}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">{t("chances")}</h3>
        <ul className="flex flex-col gap-2">
          {CHANCE_ROWS.map((r) => (
            <li key={r} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" lang="ja" className="font-seal text-sm">
                  {RARITY_SEAL[r]}
                </span>
                <span className="truncate">{tRarity(r)}</span>
              </span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={`block h-full origin-left rounded-full ${RARITY_BG[r]}`}
                  style={{ transform: `scaleX(${Math.max(odds[r], 0.01)})` }}
                />
              </span>
              <span className="text-right tabular-nums">
                <span className="sr-only">{t("chanceRow", { rarity: tRarity(r), value: percent(odds[r]) })}</span>
                <span aria-hidden="true">{percent(odds[r])}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border pt-3 text-xs">
        <span className="text-text-muted">{t("filter")}</span>
        <span className="font-bold">{t("noFilter")}</span>
      </div>

      {/* Sur mobile, le bouton vit dans la barre collée en bas de l'écran */}
      <div className="hidden flex-col gap-2 md:flex">
        <OpenLink slug={booster.slug} stock={state.stock} />
        <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />
      </div>
    </section>
  );
}
