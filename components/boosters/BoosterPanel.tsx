import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { BoosterPanelData } from "@/lib/boosters/panel";
import type { FilterContext } from "@/lib/boosters/pool-filter";
import { localize, type BoosterTypeView } from "@/lib/boosters/types";
import { RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import type { BoosterState } from "@/server/boosters/state";
import { BoosterArt } from "./BoosterArt";
import { FilterText } from "./FilterText";
import { RARITY_BG, usePercent } from "./format";
import { NextFreeIn } from "./NextFreeIn";
import { OpenLink } from "./OpenLink";

const CHANCE_ROWS: Rarity[] = ["RARE", "EPIC", "LEGENDARY", "MYTHIC"];

/** Couleur du texte des seuils de rareté (planche : bleu, violet, or, vermillon). */
const RARITY_TEXT: Record<Rarity, string> = {
  COMMON: "text-text-muted",
  UNCOMMON: "text-rarity-uncommon",
  RARE: "text-ai",
  EPIC: "text-[#b391db]",
  LEGENDARY: "text-kin",
  MYTHIC: "text-shu",
};

type Props = {
  type: BoosterTypeView;
  panel: BoosterPanelData;
  ctx: FilterContext;
  state: BoosterState;
  /** Dans la feuille « Taux » du mobile, le bouton Ouvrir vit déjà dans la barre du bas. */
  withOpen?: boolean;
  headingId?: string;
};

/** Panneau « Booster sélectionné » : contenu, garanties, compteurs, chances calculées et bouton Ouvrir. */
export function BoosterPanel({ type, panel, ctx, state, withOpen = true, headingId = "selected-booster" }: Props) {
  const t = useTranslations("boosters");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const locale = useLocale();
  const percent = usePercent();
  const name = localize(type.name, locale);
  const isBox = type.shape === "JUBAKO";
  // Jūbako : 20 emplacements, affichés en « 5 × sachet » puis la garantie
  const slots = isBox ? null : panel.slotFloors;

  const stat = (value: string, label: string, tone = "") => (
    <div className="flex min-w-0 flex-col gap-1 rounded-control bg-surface-2 p-3">
      <dd className={`font-title text-lg leading-none font-bold tabular-nums ${tone}`}>{value}</dd>
      <dt className="text-xs leading-snug text-text-muted">{label}</dt>
    </div>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <span aria-hidden="true" lang="ja" className="font-seal text-base text-shu">
          選
        </span>
        {t("selected")}
      </p>

      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0">
          <BoosterArt shape={type.shape} theme={type.theme} emblem={type.emblem} name={name} contents="" compact />
        </div>
        <div className="min-w-0">
          <h2 id={headingId} className="font-title text-2xl leading-tight font-extrabold">
            {name}
          </h2>
          <p className="text-sm text-text-muted">{localize(type.tagline, locale)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {stat(String(panel.slotFloors.length), isBox ? t("cardsInBox") : t("cardsPerBooster"))}
        {stat(tRarity(panel.best), isBox ? t("guaranteedBox") : t("guaranteed"), RARITY_TEXT[panel.best])}
        {panel.pityLeft !== null
          ? stat(format.number(panel.pityLeft), t("pityLeft"), "text-shu")
          : stat("—", t("noPity"), "text-text-muted")}
        {panel.goldenIn !== null
          ? stat(format.number(panel.goldenIn), t("goldenLeft"), "text-kin")
          : stat("—", t("noBonus"), "text-text-muted")}
        {panel.featured && panel.featured.left > 0 && stat(format.number(panel.featured.left), t("featuredLeft"), "text-kin")}
        {stat(format.number(panel.poolSize), t("possible"))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">{t("composition")}</h3>
        {slots ? (
          <ol className="flex flex-wrap gap-1.5">
            {slots.map((floor, i) => (
              <li
                key={i}
                className={`inline-flex h-8 min-w-9 flex-1 items-center justify-center gap-0.5 rounded-control px-2 font-seal text-base text-washi-paper ${RARITY_BG[floor]}`}
              >
                <span aria-hidden="true">{RARITY_SEAL[floor]}</span>
                {floor !== "COMMON" && floor !== "MYTHIC" && <span aria-hidden="true">+</span>}
                <span className="sr-only">
                  {floor === "MYTHIC" ? t("slotExact", { n: i + 1, rarity: tRarity(floor) }) : t("slot", { n: i + 1, rarity: tRarity(floor) })}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="flex gap-1.5">
            <span className="inline-flex h-8 flex-1 items-center justify-center rounded-control bg-surface-2 text-sm font-bold">
              5 × <span aria-hidden="true" lang="ja" className="ml-1 font-seal">袋</span>
            </span>
            <span className={`inline-flex h-8 flex-1 items-center justify-center gap-0.5 rounded-control font-seal text-base text-washi-paper ${RARITY_BG[panel.best]}`}>
              <span aria-hidden="true">{RARITY_SEAL[panel.best]}+</span>
              <span className="sr-only">{t("guaranteedBox")}</span>
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">{t("chances")}</h3>
        <ul className="flex flex-col gap-2">
          {CHANCE_ROWS.map((r) => (
            <li key={r} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">
              <span className={`flex min-w-0 items-center gap-1.5 font-bold ${RARITY_TEXT[r]}`}>
                <span aria-hidden="true" lang="ja" className="font-seal text-sm">
                  {RARITY_SEAL[r]}
                </span>
                <span className="truncate">{tRarity(r)}</span>
              </span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={`block h-full origin-left rounded-full ${RARITY_BG[r]}`}
                  style={{ transform: `scaleX(${Math.max(panel.odds[r], 0.02)})` }}
                />
              </span>
              <span className="text-right tabular-nums">
                <span className="sr-only">{t("chanceRow", { rarity: tRarity(r), value: percent(panel.odds[r]) })}</span>
                <span aria-hidden="true">{percent(panel.odds[r])}</span>
              </span>
            </li>
          ))}
          {panel.featured && (
            <li className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 font-bold text-kin">
                <span aria-hidden="true" lang="ja" className="font-seal text-sm">
                  星
                </span>
                <span className="truncate">{t("featuredChance")}</span>
              </span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full origin-left rounded-full bg-kin" style={{ transform: `scaleX(${Math.max(panel.featured.chance, 0.02)})` }} />
              </span>
              <span className="text-right tabular-nums">
                <span className="sr-only">{t("featuredRow", { value: percent(panel.featured.chance) })}</span>
                <span aria-hidden="true">{percent(panel.featured.chance)}</span>
              </span>
            </li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-dashed border-border pt-3 text-xs">
        <span className="text-text-muted">{t("filter")}</span>
        <span className="font-medium">
          <FilterText type={type} ctx={ctx} />
        </span>
      </div>

      {withOpen && (
        <div className="flex flex-col gap-2">
          <OpenLink slug={type.slug} price={panel.price} availability={panel.availability} stock={state.stock} coins={state.coins} />
          {type.usesFreeStock && <NextFreeIn nextAt={state.nextAt} serverNow={state.serverNow} />}
        </div>
      )}
    </section>
  );
}
