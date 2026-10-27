import { useTranslations } from "next-intl";
import { Fuda } from "@/components/fuda/Fuda";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/i18n/navigation";
import type { CardView } from "@/lib/boosters/view";
import { MAX_WISHLIST_CARDS } from "@/lib/collection/wishlist";
import { OwnedBadge } from "../collection/OwnedBadge";
import { WishlistToggle } from "./WishlistToggle";

export function WishlistSection({ cards, editable, owned = [] }: { cards: CardView[]; editable: boolean; owned?: string[] }) {
  const t = useTranslations("wishlist");
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="profile-wishlist-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id="profile-wishlist-title" kanji="願" title={t("title")} />
        <span className="text-sm text-text-muted">{t("count", { count: cards.length, max: MAX_WISHLIST_CARDS })}</span>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">{t("hint", { max: MAX_WISHLIST_CARDS })}</p>
          <ButtonLink href="/wiki">{t("browse")}</ButtonLink>
        </div>
      )}
      {cards.length === 0 ? (
        <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t(editable ? "emptyOwner" : "emptyPublic")}</p>
      ) : (
        <ol aria-label={t("title")} className="grid grid-cols-4 gap-x-2 gap-y-5 md:gap-x-6">
          {cards.map((card) => (
            <li key={card.cardId} className="flex min-w-0 flex-col gap-2">
              <Link href={`/wiki/${card.anilistId}`} aria-label={`${card.name} · ${card.series}`} className="block rounded-[5px]">
                <Fuda card={card} series={card.series} size="sm" sizes="(min-width: 1200px) 274px, 25vw" corner={owned.includes(card.cardId) && <OwnedBadge compact />} />
              </Link>
              {editable && <WishlistToggle cardId={card.cardId} name={card.name} initial compact />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export type ProfileSaleCard = CardView & { copies: number; auctionId: string };

export function ProfileSalesSection({ cards, owned = [] }: { cards: ProfileSaleCard[]; owned?: string[] }) {
  const t = useTranslations("profile.sales");
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="profile-sales-title">
      <SectionTitle id="profile-sales-title" kanji="売" title={t("title")} />
      {cards.length === 0 ? (
        <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul aria-label={t("title")} className="grid grid-cols-6 gap-1 sm:gap-2 md:gap-4 max-sm:[&_.fuda>span]:hidden max-sm:[&_.fuda-paper_span]:hidden">
          {cards.map((card) => (
            <li key={card.cardId} className="relative min-w-0">
              <Link href={`/marche/${card.auctionId}`} aria-label={t("open", { name: card.name, count: card.copies })} className="relative block rounded-[5px]">
                <Fuda
                  card={card}
                  series={card.series}
                  size="sm"
                  sizes="(min-width: 1200px) 181px, 17vw"
                  overlay={
                    <>
                      {card.copies > 1 && <span aria-hidden="true" className="absolute top-1 right-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border border-bg bg-shu-btn px-1.5 text-xs font-bold text-white">×{card.copies}</span>}
                      {/* En surcouche et non dans `corner` : sur téléphone, cette grille masque les pastilles du papier */}
                      {owned.includes(card.cardId) && <span className="absolute right-1 bottom-6"><OwnedBadge compact /></span>}
                    </>
                  }
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
