import { useFormatter, useTranslations } from "next-intl";
import type { PublicReview, ReviewSummary } from "@/server/social/reviews";
import { displayName } from "../profile/ProfileHeader";
import { SectionTitle } from "../SectionTitle";
import { ButtonLink } from "../ui/ButtonLink";
import { ReviewButton } from "./ReviewButton";
import { ReviewsCarousel, type ReviewCard } from "./ReviewsCarousel";
import { Stars } from "./Stars";

export type ReviewViewer =
  { kind: "member"; own: { rating: number; body: string } | null } | { kind: "guest" } | { kind: "none" };

/** Bandeau « Ce qu'en disent les joueurs » : note moyenne, carrousel d'avis au hasard, bouton pour donner le sien. */
export function ReviewsSection({
  reviews,
  summary,
  viewer,
}: {
  reviews: PublicReview[];
  summary: ReviewSummary;
  viewer: ReviewViewer;
}) {
  const t = useTranslations("home.reviews");
  const tAccount = useTranslations("account");
  const format = useFormatter();

  const cards: ReviewCard[] = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    date: format.dateTime(new Date(r.updatedAt), { day: "numeric", month: "long" }),
    name: displayName(r.username, r.isGuest, (code) => tAccount("guestName", { code })),
    username: r.username,
    image: r.image,
    pinned: r.pinned,
    reply: r.reply,
  }));

  return (
    <section aria-labelledby="avis-joueurs" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <SectionTitle id="avis-joueurs" kanji="声" title={t("title")} />
        {summary.average !== null && (
          <p className="flex items-center gap-2">
            <span className="font-title text-3xl font-extrabold text-kin tabular-nums">
              {format.number(summary.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <Stars rating={summary.average} label={t("averageLabel", { rating: summary.average })} size={18} />
            <span className="text-xs text-text-muted tabular-nums">{t("count", { count: summary.count })}</span>
          </p>
        )}
      </div>

      {cards.length > 0 ? (
        <ReviewsCarousel reviews={cards} />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">{t("empty")}</p>
      )}

      {viewer.kind === "member" && <ReviewButton own={viewer.own} />}
      {viewer.kind === "guest" && (
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/inscription" variant="secondary">
            {t("give")}
          </ButtonLink>
          <p className="text-sm text-text-muted">{t("guestHint")}</p>
        </div>
      )}
    </section>
  );
}
