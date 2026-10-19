import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import { contentsLabel } from "@/lib/boosters/catalog";
import { localize, type BoosterTypeView } from "@/lib/boosters/types";
import { BoosterArt } from "./BoosterArt";
import { PriceTag } from "./PriceTag";

/** Tuile d'un booster : le dessin sur une carte laquée avec son halo, puis son prix. Un appui le sélectionne (panneau à droite ou en bas). */
export function BoosterTile({ type, cards, selected, stock }: { type: BoosterTypeView; cards: number; selected: boolean; stock: number }) {
  const t = useTranslations("boosters");
  const locale = useLocale();
  const name = localize(type.name, locale);
  return (
    <Link
      prefetch={false}
      href={`/?b=${type.slug}&f=${type.family}`}
      scroll={false}
      aria-label={t("selectTile", { name })}
      aria-current={selected ? "true" : undefined}
      style={{ "--booster-aura": type.theme.base } as CSSProperties}
      className={`booster-tile lacquer group relative isolate flex h-full flex-col items-stretch gap-3 overflow-hidden rounded-hero p-2.5 transition-transform active:scale-[0.98] motion-reduce:transform-none sm:p-3 ${
        selected ? "border-shu-btn ring-2 ring-shu-btn ring-inset" : "hover:border-text-muted/40"
      }`}
    >
      {/* Halo teinté par la couleur du booster : un dégradé radial, sans filtre de flou */}
      <span aria-hidden="true" className="booster-hover-aura" data-selected={selected || undefined} />
      <div className="relative">
        <BoosterArt
          shape={type.shape}
          theme={type.theme}
          emblem={type.emblem}
          name={name}
          tagline={localize(type.tagline, locale)}
          contents={contentsLabel(cards)}
          className="transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 motion-reduce:transform-none"
        />
      </div>
      <PriceTag type={type} stock={stock} />
    </Link>
  );
}
