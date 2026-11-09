import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import type { ShowcaseCard } from "@/lib/collection/view";
import { SHOWCASE_LAYOUTS, type ShowcaseLayoutId } from "@/lib/showcase/layouts";
import type { ShowcaseThemeId } from "@/lib/showcase/theme-registry";
import { OwnedBadge } from "../collection/OwnedBadge";
import { cardSizing, ShowcaseStage, type StageSlot } from "./ShowcaseStage";

/** Carte d'une vitrine en lecture : lien vers sa fiche (collection du propriétaire, ou wiki). */
export function ShowcaseCardLink({
  card,
  layout,
  index,
  linkBase,
  owned,
  preload,
}: {
  card: ShowcaseCard;
  layout: ShowcaseLayoutId;
  index: number;
  linkBase: "/collection" | "/wiki";
  owned: boolean;
  preload: boolean;
}) {
  const { size, sizes } = cardSizing(layout, index);
  return (
    <Link href={`${linkBase}/${card.anilistId}`} prefetch={false} className="block rounded-[7px]">
      <Fuda card={card} series={card.series} size={size} sizes={sizes} preload={preload} corner={owned && <OwnedBadge />} />
    </Link>
  );
}

/**
 * Vitrine en lecture (profil, page de la vitrine, visiteur). Les cases vides restent en pointillés pour
 * le propriétaire et deviennent invisibles pour un visiteur ; la Frise ne garde que ses cartes.
 */
export function ShowcaseView({
  name,
  layout,
  theme,
  cards,
  owned = [],
  linkBase,
  isOwner,
  preload = false,
}: {
  name: string;
  layout: ShowcaseLayoutId;
  theme: ShowcaseThemeId;
  cards: readonly (ShowcaseCard | null)[];
  owned?: readonly string[];
  linkBase: "/collection" | "/wiki";
  isOwner: boolean;
  /** Vitrine en haut de page : ses premières images se chargent tout de suite. */
  preload?: boolean;
}) {
  const t = useTranslations("showcase");
  const frieze = SHOWCASE_LAYOUTS[layout].kind === "frieze";
  const list = frieze && !isOwner ? cards.filter((c) => c !== null) : cards;
  const slots: StageSlot[] = list.map((card, i) =>
    card
      ? {
          node: <ShowcaseCardLink card={card} layout={layout} index={i} linkBase={linkBase} owned={owned.includes(card.cardId)} preload={preload && i < 2} />,
          rarity: card.rarity,
        }
      : { node: <span aria-hidden="true" className="vt-empty" data-hidden={!isOwner || undefined} />, empty: true },
  );
  const count = cards.filter((c) => c !== null).length;
  return <ShowcaseStage layout={layout} theme={theme} slots={slots} label={t("stageLabel", { name, count })} />;
}
