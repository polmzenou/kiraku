import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import { contentsLabel } from "@/lib/boosters/catalog";
import { localize, type BoosterTypeView } from "@/lib/boosters/types";
import { BoosterArt } from "./BoosterArt";
import { PriceTag } from "./PriceTag";

/** Tuile d'un booster : le dessin, puis son prix. Un appui le sélectionne (panneau à droite ou en bas). */
export function BoosterTile({ type, cards, selected, stock }: { type: BoosterTypeView; cards: number; selected: boolean; stock: number }) {
  const t = useTranslations("boosters");
  const locale = useLocale();
  const name = localize(type.name, locale);
  return (
    <Link
      href={`/?b=${type.slug}&f=${type.family}`}
      scroll={false}
      aria-label={t("selectTile", { name })}
      aria-current={selected ? "true" : undefined}
      style={{ "--booster-aura": type.theme.base } as CSSProperties}
      className={`booster-tile group flex h-full flex-col items-stretch gap-3 rounded-[14px] border-2 p-2.5 transition-transform active:scale-[0.98] sm:p-3 ${
        selected ? "border-shu-btn bg-surface" : "border-transparent hover:bg-surface/60"
      }`}
    >
      <div className="relative isolate">
        <span aria-hidden="true" className="booster-hover-aura" />
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
