"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { CardView } from "@/lib/boosters/view";
import type { CollectionItem } from "@/lib/collection/view";
import { cancelListingAction, makeOfferAction, withdrawOfferAction } from "@/server/actions/listings";
import type { ListingView } from "@/server/market/listings";
import { CardPickGrid } from "../../collection/CardPickGrid";
import { Fuda } from "../../fuda/Fuda";
import { displayName } from "../../profile/ProfileHeader";
import { Button } from "../../ui/Button";
import { playerTag } from "../../social/PlayerName";
import { NoteText } from "../../ui/NoteText";
import { Sheet } from "../../ui/Sheet";
import { AdminNoteDelete } from "../AdminNoteDelete";
import { CardThumb } from "./CardThumb";

/** Ce que le joueur s'apprête à proposer : une carte demandée, ou une carte choisie dans sa collection. */
type Pending = { cardId: string; name: string };

/**
 * Une annonce : la carte donnée à gauche, les cartes demandées à droite (cerclées d'or quand le
 * lecteur peut les donner), puis « Donner X » ou « Proposer autre chose ». L'auteur, lui, voit le
 * nombre d'offres et peut retirer l'annonce.
 */
export function ListingCard({
  listing,
  guest,
  isAdmin,
  allowOther,
  onChanged,
}: {
  listing: ListingView;
  guest: boolean;
  isAdmin: boolean;
  allowOther: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("listings");
  const tAccount = useTranslations("account");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const owner = displayName(listing.owner.username, listing.owner.isGuest, (code) => tAccount("guestName", { code }));
  const givable = listing.wants.filter((w) => w.givable);

  const run = (call: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await call();
        if (!res.ok) {
          setError(t(`errors.${res.error}` as "errors.UNAVAILABLE"));
          return;
        }
        after?.();
        onChanged();
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  const send = (offer: Pending) =>
    run(
      () => makeOfferAction({ listingId: listing.id, cardId: offer.cardId }),
      () => {
        setConfirm(null);
        setPicking(false);
        setSent(true);
      },
    );

  return (
    <article className="flex flex-col gap-3 lacquer rounded-card p-3 md:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-16 shrink-0 md:w-20">
            <Fuda card={listing.card} series={listing.card.series} size="sm" tilt={false} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate font-bold">{listing.card.name}</p>
            <p className="truncate text-sm text-text-muted">
              {t("cardMeta", { rarity: tRarity(listing.card.rarity as "COMMON"), series: listing.card.series })}
            </p>
            <p className="truncate text-xs text-text-muted">
              {listing.mine ? t("byYou") : t.rich("by", { name: owner, player: playerTag(listing.owner.decor.nameColor) })} · {t("expires", { when: format.relativeTime(listing.expiresAt) })}
            </p>
          </div>
        </div>

        <span aria-hidden="true" className="hidden text-xl text-text-muted sm:block">
          ⇄
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-bold tracking-wide text-text-muted uppercase">{t("againstOne")}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label={t("againstOne")}>
            {listing.wants.map((w) => (
              <li key={w.cardId} title={w.name}>
                <CardThumb card={w} highlight={w.givable} dim={!listing.mine && !guest && !w.givable} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {listing.note && (
        <NoteText text={listing.note} action={isAdmin ? <AdminNoteDelete kind="LISTING" id={listing.id} /> : null} />
      )}

      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}

      {!guest && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {listing.mine ? (
            <>
              <p className="mr-auto text-sm text-text-muted">{t("offerCount", { count: listing.offerCount })}</p>
              <Button type="button" onClick={() => run(() => cancelListingAction({ listingId: listing.id }))} disabled={pending}>
                {t("cancelListing")}
              </Button>
            </>
          ) : listing.myOffer || sent ? (
            <>
              <p className="mr-auto text-sm">
                {listing.myOffer ? t("offerSent", { card: listing.myOffer.card.name }) : t("offerSentShort")}
              </p>
              {listing.myOffer && (
                <Button type="button" onClick={() => run(() => withdrawOfferAction({ offerId: listing.myOffer!.id }))} disabled={pending}>
                  {t("withdraw")}
                </Button>
              )}
            </>
          ) : confirm ? (
            <>
              <p className="mr-auto text-sm font-bold">{t("confirmOffer", { give: confirm.name, get: listing.card.name })}</p>
              <Button type="button" onClick={() => setConfirm(null)} disabled={pending}>
                {t("back")}
              </Button>
              <Button type="button" variant="primary" onClick={() => send(confirm)} disabled={pending}>
                {pending ? t("pending") : t("send")}
              </Button>
            </>
          ) : (
            <>
              {givable.length === 0 && <p className="text-sm text-text-muted">{t("noneFree")}</p>}
              {givable.map((w) => (
                <Button key={w.cardId} type="button" variant="primary" onClick={() => setConfirm({ cardId: w.cardId, name: w.name })}>
                  {t("give", { card: w.name })}
                </Button>
              ))}
              {allowOther && (
                <Button type="button" onClick={() => setPicking(true)}>
                  {t("proposeOther")}
                </Button>
              )}
            </>
          )}
        </footer>
      )}

      {picking && (
        <OtherCardSheet
          listingCard={listing.card}
          pending={pending}
          error={error}
          onSend={send}
          onClose={() => {
            setPicking(false);
            setError(null);
          }}
        />
      )}
    </article>
  );
}

/** « Proposer autre chose » : n'importe quelle carte de sa collection, puis confirmation. */
function OtherCardSheet({
  listingCard,
  pending,
  error,
  onSend,
  onClose,
}: {
  listingCard: CardView;
  pending: boolean;
  error: string | null;
  onSend: (offer: Pending) => void;
  onClose: () => void;
}) {
  const t = useTranslations("listings");
  const [chosen, setChosen] = useState<CollectionItem | null>(null);
  return (
    <Sheet open onClose={onClose} title={t("otherTitle", { card: listingCard.name })} wide>
      {chosen ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-text-muted">{t("youGive")}</p>
              <Fuda card={chosen} series={chosen.series} size="sm" tilt={false} />
            </div>
            <span aria-hidden="true" lang="ja" className="font-seal text-2xl text-shu">
              換
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-text-muted">{t("youGet")}</p>
              <Fuda card={listingCard} series={listingCard.series} size="sm" tilt={false} />
            </div>
          </div>
          <p className="text-xs text-text-muted">{t("offerRules")}</p>
          {error && (
            <p role="alert" className="text-sm text-shu">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setChosen(null)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="primary" onClick={() => onSend({ cardId: chosen.cardId, name: chosen.name })} disabled={pending}>
              {pending ? t("pending") : t("send")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-text-muted">{t("otherHint")}</p>
          <CardPickGrid
            selected={new Set()}
            disabled={new Set([listingCard.cardId])}
            pickLabel={(card) => t("pickOther", { card })}
            onPick={setChosen}
          />
        </>
      )}
    </Sheet>
  );
}
