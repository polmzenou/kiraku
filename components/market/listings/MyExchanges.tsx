"use client";

import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { OpenedCardView } from "@/lib/boosters/view";
import { cancelListingAction, markListingRevealsSeenAction, withdrawOfferAction } from "@/server/actions/listings";
import type { ExchangeHistoryView, MyExchanges as MyExchangesData, MyListingView, SentOfferView } from "@/server/market/listings";
import type { PlayerRef } from "@/server/social/queries";
import { Fuda } from "../../fuda/Fuda";
import { displayName } from "../../profile/ProfileHeader";
import { SectionTitle } from "../../SectionTitle";
import { PlayerAvatar } from "../../social/PlayerAvatar";
import { playerTag } from "../../social/PlayerName";
import { Button } from "../../ui/Button";
import { NoteText } from "../../ui/NoteText";
import { CardThumb } from "./CardThumb";
import { OfferDecision } from "./OfferDecision";

const CardReveal = dynamic(() => import("../../economy/CardReveal").then((m) => m.CardReveal), { ssr: false });

function usePlayerName() {
  const tAccount = useTranslations("account");
  return (p: PlayerRef) => displayName(p.username, p.isGuest, (code) => tAccount("guestName", { code }));
}

/** Onglet « Mes échanges » : offres reçues sur mes annonces, offres envoyées, historique. */
export function MyExchanges({ data }: { data: MyExchangesData }) {
  const t = useTranslations("listings");
  return (
    <div className="flex flex-col gap-6">
      <ListingReveals offerIds={data.reveals.offerIds} cards={data.reveals.cards} />

      <section className="flex flex-col gap-3">
        <SectionTitle kanji="換" title={t("mine.listings")} />
        {data.listings.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">
            {t("mine.noListings")}{" "}
            <Link href="/marche?onglet=echanges" className="font-bold text-shu underline-offset-2 hover:underline">
              {t("mine.goBoard")}
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.listings.map((l) => (
              <li key={l.id}>
                <MyListing listing={l} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle kanji="送" title={t("mine.sent")} />
        {data.sent.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("mine.noSent")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.sent.map((o) => (
              <li key={o.id}>
                <SentOffer offer={o} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle kanji="記" title={t("mine.history")} />
        {data.history.length === 0 ? (
          <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("mine.noHistory")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.history.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <HistoryRow entry={h} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MyListing({ listing }: { listing: MyListingView }) {
  const t = useTranslations("listings");
  const format = useFormatter();
  const router = useRouter();
  const name = usePlayerName();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await cancelListingAction({ listingId: listing.id });
        if (!res.ok) setError(t(`errors.${res.error}` as "errors.UNAVAILABLE"));
        else router.refresh();
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  return (
    <article className="flex flex-col gap-3 lacquer rounded-card p-3 md:p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-14 shrink-0">
          <Fuda card={listing.card} series={listing.card.series} size="sm" tilt={false} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-bold">{t("mine.giving", { card: listing.card.name })}</p>
          <ul className="flex flex-wrap gap-1" aria-label={t("againstOne")}>
            {listing.wants.map((w) => (
              <li key={w.cardId} title={w.name}>
                <CardThumb card={w} size="sm" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted tabular-nums">{t("expires", { when: format.relativeTime(listing.expiresAt) })}</p>
        </div>
        <Button type="button" onClick={cancel} disabled={pending}>
          {t("cancelListing")}
        </Button>
      </header>
      {listing.note && <NoteText text={listing.note} label={t("yourNote")} />}
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}

      {listing.offers.length === 0 ? (
        <p className="border-t border-border pt-3 text-sm text-text-muted">{t("mine.noOffers")}</p>
      ) : (
        <ul className="flex flex-col gap-3 border-t border-border pt-3" aria-label={t("mine.offersLabel")}>
          {listing.offers.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 rounded-card bg-surface-2 p-3">
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <PlayerAvatar username={o.bidder.username} image={o.bidder.image} size={28} frame={o.bidder.decor.frame} />
                <span className="truncate">
                  {t.rich("mine.offerFrom", { name: name(o.bidder), card: o.card.name, player: playerTag(o.bidder.decor.nameColor) })}
                  {!o.fromWants && <span className="ml-1 text-text-muted">{t("mine.outsideList")}</span>}
                </span>
              </p>
              <div className="grid grid-cols-[4.5rem_auto_4.5rem] items-center gap-3">
                <Fuda card={listing.card} series={listing.card.series} size="sm" tilt={false} />
                <span aria-hidden="true" lang="ja" className="font-seal text-xl text-shu">
                  換
                </span>
                <Fuda card={o.card} series={o.card.series} size="sm" tilt={false} />
              </div>
              <OfferDecision offerId={o.id} offeredName={o.card.name} onDone={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SentOffer({ offer }: { offer: SentOfferView }) {
  const t = useTranslations("listings");
  const format = useFormatter();
  const router = useRouter();
  const name = usePlayerName();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const withdraw = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await withdrawOfferAction({ offerId: offer.id });
        if (!res.ok) setError(t(`errors.${res.error}` as "errors.UNAVAILABLE"));
        else router.refresh();
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  return (
    <article className="flex flex-col gap-3 lacquer rounded-card p-3 md:p-4">
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <PlayerAvatar username={offer.listing.owner.username} image={offer.listing.owner.image} size={28} frame={offer.listing.owner.decor.frame} />
        <span className="truncate">{t.rich("mine.sentTo", { name: name(offer.listing.owner), player: playerTag(offer.listing.owner.decor.nameColor) })}</span>
        <span className="ml-auto shrink-0 rounded-pill border border-ai/50 px-2 py-0.5 text-xs font-bold text-ai tabular-nums">
          {t("expires", { when: format.relativeTime(offer.listing.expiresAt) })}
        </span>
      </p>
      <div className="grid grid-cols-[4.5rem_auto_4.5rem] items-center gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-muted">{t("youGive")}</p>
          <Fuda card={offer.card} series={offer.card.series} size="sm" tilt={false} />
        </div>
        <span aria-hidden="true" lang="ja" className="mt-4 font-seal text-xl text-shu">
          換
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-muted">{t("youGet")}</p>
          <Fuda card={offer.listing.card} series={offer.listing.card.series} size="sm" tilt={false} />
        </div>
      </div>
      {offer.listing.note && <NoteText text={offer.listing.note} label={t("ownerNote", { name: name(offer.listing.owner) })} />}
      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      <footer className="flex justify-end">
        <Button type="button" onClick={withdraw} disabled={pending}>
          {t("withdraw")}
        </Button>
      </footer>
    </article>
  );
}

function HistoryRow({ entry }: { entry: ExchangeHistoryView }) {
  const t = useTranslations("listings");
  const format = useFormatter();
  const name = usePlayerName();
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <CardThumb card={entry.gave} size="sm" />
        <span aria-hidden="true" className="text-text-muted">
          ⇄
        </span>
        {entry.got ? <CardThumb card={entry.got} size="sm" /> : <span className="w-10" />}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm">
            {entry.got
              ? t("history.line", { gave: entry.gave.name, got: entry.got.name })
              : t("history.lineAlone", { gave: entry.gave.name })}
          </p>
          <p className="truncate text-xs text-text-muted">
            {entry.other ? `${t("history.with", { name: name(entry.other) })} · ` : ""}
            {entry.resolvedAt ? format.relativeTime(entry.resolvedAt) : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-pill border border-border px-2 py-0.5 text-xs font-bold text-text-muted">
          {t(`history.status.${entry.kind}.${entry.status}` as "history.status.offer.ACCEPTED")}
        </span>
      </div>
      {entry.declineNote && <NoteText text={entry.declineNote} label={t("declineNoteLabel")} />}
    </div>
  );
}

/**
 * Cartes reçues en tant qu'offrant depuis la dernière visite : révélées comme au sortir d'un
 * booster, puis marquées vues.
 */
function ListingReveals({ offerIds, cards }: { offerIds: string[]; cards: OpenedCardView[] }) {
  const [open, setOpen] = useState(cards.length > 0);
  if (!open || cards.length === 0) return null;
  return (
    <CardReveal
      cards={cards}
      onClose={() => {
        setOpen(false);
        void markListingRevealsSeenAction({ offerIds });
      }}
    />
  );
}
