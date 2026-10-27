
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { BoosterPanelData, WishlistInPool } from "@/lib/boosters/panel";
import type { FilterContext } from "@/lib/boosters/pool-filter";
import { localize, type BoosterTypeView } from "@/lib/boosters/types";
import { VARIANT_RARITIES, type Rarity } from "@/lib/catalog/rarity";
import type { BoosterState } from "@/server/boosters/state";
import { BoosterArt } from "./BoosterArt";
import { FilterText } from "./FilterText";
import { RARITY_BG, usePercent } from "./format";
import { NextFreeIn } from "./NextFreeIn";
import { OpenLink } from "./OpenLink";

export const CHANCE_ROWS: Rarity[] = ["RARE", "EPIC", "LEGENDARY", "MYTHIC"];

/** Lignes de chances : les seuils de base, puis AR et Gold quand le pool du booster en contient. */
export function chanceRows(odds: BoosterPanelData["odds"]): Rarity[] {
  return [...CHANCE_ROWS, ...VARIANT_RARITIES.filter((r) => (odds[r] ?? 0) > 0)];
}

/** Couleur du texte des seuils de rareté (planche : bleu, violet, or, vermillon). */
export const RARITY_TEXT: Record<Rarity, string> = {
  COMMON: "text-text-muted",
  UNCOMMON: "text-rarity-uncommon",
  RARE: "text-ai",
  EPIC: "text-[#b391db]",
  LEGENDARY: "text-kin",
  MYTHIC: "text-shu",
  AR: "text-rarity-ar",
  GOLD: "text-rarity-gold",
};

type Props = {
  type: BoosterTypeView;
  panel: BoosterPanelData;
  ctx: FilterContext;
  state: BoosterState;
  /** Souhaits du joueur présents dans le pool ; null sans liste de souhaits. */
  wishlist?: WishlistInPool | null;
  /** Dans la feuille « Taux » du mobile, le bouton Ouvrir vit déjà dans la barre du bas. */
  withOpen?: boolean;
  headingId?: string;
};

/** Panneau « Booster sélectionné » : contenu, garanties, compteurs, chances calculées et bouton Ouvrir. */
export function BoosterPanel({ type, panel, ctx, state, wishlist = null, withOpen = true, headingId = "selected-booster" }: Props) {
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("boosters");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const locale = useLocale();
  const percent = usePercent();
  const name = localize(type.name, locale);
  const isBox = type.shape === "JUBAKO";

  const stat = (value: string, label: string, tone = "") => (
    <div className="flex min-w-0 flex-col gap-1 rounded-control bg-surface-2 p-3">
      <dd className={`font-title text-lg leading-none font-bold tabular-nums ${tone}`}>{value}</dd>
      <dt className="text-xs leading-snug text-text-muted">{label}</dt>
    </div>
  );

  return (
    <section aria-labelledby={headingId} className="lacquer flex flex-col gap-5 rounded-hero p-4 sm:p-5">
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
          <h2 id={headingId} className="font-heading text-2xl leading-tight font-extrabold">
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
        {panel.featured && panel.featured.left > 0 && stat(format.number(panel.featured.left), t(panel.featured.focus ? "focusLeft" : "featuredLeft"), "text-kin")}
        {stat(format.number(panel.poolSize), t("possible"))}
      </dl>

      {wishlist && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold">{t("wishlist.title")}</h3>
          <WishlistSummary wishlist={wishlist} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">{t("composition")}</h3>
        <BoosterComposition panel={panel} isBox={isBox} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">{t("chances")}</h3>
        <ul className="flex flex-col gap-2">
          {chanceRows(panel.odds).map((r) => (
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
                <span className="truncate">{t(panel.featured.focus ? "focusChance" : "featuredChance")}</span>
              </span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full origin-left rounded-full bg-kin" style={{ transform: `scaleX(${Math.max(panel.featured.chance, 0.02)})` }} />
              </span>
              <span className="text-right tabular-nums">
                <span className="sr-only">{t(panel.featured.focus ? "focusRow" : "featuredRow", { value: percent(panel.featured.chance) })}</span>
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

/** Emplacements du booster, du plancher le plus bas au plus haut ; jūbako : « 5 × 袋 » puis la garantie. */
export function BoosterComposition({ panel, isBox }: { panel: Pick<BoosterPanelData, "slotFloors" | "best">; isBox: boolean }) {
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("boosters");
  const tRarity = useTranslations("rarity");

  if (isBox) {
    return (
      <p className="flex gap-1.5">
        <span className="inline-flex h-8 flex-1 items-center justify-center rounded-control bg-surface-2 text-sm font-bold">
          5 × <span aria-hidden="true" lang="ja" className="ml-1 font-seal">袋</span>
        </span>
        <span className={`inline-flex h-8 flex-1 items-center justify-center gap-0.5 rounded-control font-seal text-base text-washi-paper ${RARITY_BG[panel.best]}`}>
          <span aria-hidden="true">{RARITY_SEAL[panel.best]}+</span>
          <span className="sr-only">{t("guaranteedBox")}</span>
        </span>
      </p>
    );
  }
  return (
    <ol className="flex flex-wrap gap-1.5">
      {panel.slotFloors.map((floor, i) => (
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
  );
}

/** « 望 3 / 12 de tes souhaits peuvent sortir de ce booster ». */
export function WishlistSummary({ wishlist }: { wishlist: WishlistInPool }) {
  const t = useTranslations("boosters");
  return (
    <p className="flex items-center gap-3 rounded-control border border-sakura/60 bg-surface-2 p-3">
      <span aria-hidden="true" lang="ja" className={`font-seal text-xl leading-none ${wishlist.inPool > 0 ? "text-sakura" : "text-text-muted"}`}>
        望
      </span>
      {wishlist.inPool > 0 ? (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-title text-lg leading-none font-bold tabular-nums text-sakura">
            {t("wishlist.count", { inPool: wishlist.inPool, total: wishlist.total })}
          </span>
          <span className="text-xs leading-snug text-text-muted">{t("wishlist.label", { count: wishlist.inPool })}</span>
        </span>
      ) : (
        <span className="text-xs leading-snug text-text-muted">{t("wishlist.none")}</span>
      )}
    </p>
  );
}
