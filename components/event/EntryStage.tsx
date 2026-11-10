import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import type { ShowcaseEntryView } from "@/lib/event/view";
import { SHOWCASE_LAYOUTS } from "@/lib/showcase/layouts";
import { cardSizing, ShowcaseStage, type StageSlot } from "../showcase/ShowcaseStage";

/**
 * Vitrine engagée, telle qu'elle a été photographiée : même disposition et même thème que sur le profil,
 * en version galerie (fond fixe, cartes figées, non cliquables). Les cases vides ne se voient pas.
 */
export function EntryStage({ entry, label }: { entry: ShowcaseEntryView; label: string }) {
  const t = useTranslations("showcase");
  const frieze = SHOWCASE_LAYOUTS[entry.layout].kind === "frieze";
  const cards = frieze ? entry.cards.filter((c) => c !== null) : entry.cards;
  const slots: StageSlot[] = cards.map((card, i) => {
    if (!card) return { node: <span aria-hidden="true" className="vt-empty" data-hidden />, empty: true };
    const { size, sizes } = cardSizing(entry.layout, i);
    return { node: <Fuda card={card} series={card.series} size={size} sizes={sizes} still />, rarity: card.rarity };
  });
  const count = entry.cards.filter((c) => c !== null).length;
  return (
    <ShowcaseStage
      layout={entry.layout}
      theme={entry.theme}
      slots={slots}
      label={t("stageLabel", { name: entry.name ?? label, count })}
      gallery
    />
  );
}
