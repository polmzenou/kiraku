import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ShopCard, ShopView } from "@/lib/economy/shop-view";
import type { LotView } from "@/server/economy/lot-view";
import { SectionTitle } from "../SectionTitle";
import { FeaturedPack } from "./FeaturedPack";
import { PackCard } from "./PackCard";
import { ShopCountdown } from "./ShopCountdown";
import { sectionKanji, ShopFamilyNav } from "./ShopFamilyNav";
import { TiltGrid } from "./TiltGrid";

/** Cartes qui entrent en cascade au chargement : seules les premières sont visibles de toute façon. */
const ENTERING = 8;

/**
 * Rayons de la boutique : vedette de la sélection, accès aux familles, puis une section par famille de
 * booster (et « Fuda et extras »). Partagé par /boutique et son aperçu : chacun rend son bouton.
 */
export function ShopShelves({
  view,
  coins,
  now,
  selectionEndsAt,
  renderBuy,
}: {
  view: ShopView<LotView>;
  coins: number;
  now: Date;
  /** Fin de la sélection du moment : les packs proposés et la vedette changent. */
  selectionEndsAt: Date;
  renderBuy: (card: ShopCard<LotView>, place: "hero" | "grid") => ReactNode;
}) {
  const t = useTranslations("economy.shop");
  const tb = useTranslations("boosters");
  const order = new Map(view.sections.flatMap((s) => s.cards).map((c, i) => [c.id, i]));

  return (
    <>
      {view.featured && (
        <FeaturedPack
          card={view.featured}
          affordable={coins >= view.featured.price}
          buy={renderBuy(view.featured, "hero")}
          countdown={<ShopCountdown endsAt={selectionEndsAt.getTime()} initialNow={now.getTime()} />}
          now={now}
        />
      )}
      <div className="flex flex-col gap-2">
        {view.sections.length > 1 && <ShopFamilyNav sections={view.sections.map((s) => s.key)} />}
        <p className="text-xs text-text-muted">{t("pack.credits", { noBonus: tb("noBonus") })}</p>
      </div>
      <TiltGrid className="flex flex-col gap-8">
        {view.sections.map((section) => {
          const titleId = `famille-${section.key}-title`;
          return (
            <section
              key={section.key}
              id={`famille-${section.key}`}
              aria-labelledby={titleId}
              className="flex scroll-mt-20 flex-col gap-3 md:scroll-mt-24"
            >
              <SectionTitle
                id={titleId}
                kanji={sectionKanji(section.key)}
                title={section.key === "other" ? t("other.title") : tb(`families.${section.key}.title`)}
                subtitle={section.key === "other" ? t("other.subtitle") : tb(`families.${section.key}.subtitle`)}
              />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.cards.map((card) => {
                  const index = order.get(card.id) ?? ENTERING;
                  return (
                    <PackCard
                      key={card.id}
                      card={card}
                      affordable={coins >= card.price}
                      buy={renderBuy(card, "grid")}
                      now={now}
                      enterIndex={index < ENTERING ? index : undefined}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
      </TiltGrid>
    </>
  );
}
