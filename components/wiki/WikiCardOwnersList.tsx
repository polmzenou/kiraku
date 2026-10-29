"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CardView } from "@/lib/boosters/view";
import type { Rarity } from "@/lib/catalog/rarity";
import type { PlayerRef } from "@/server/profile/decor";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { PlayerName } from "../social/PlayerName";
import { TradeComposer } from "../social/TradeComposer";
import { Button } from "../ui/Button";

/** Pourquoi le lecteur ne peut pas demander d'échange ici (null : il peut). */
export type OwnersBlock = "guest" | "closed" | "rarity" | null;

/**
 * Joueurs qui possèdent la carte de la fiche, amis d'abord. « Demander l'échange » ouvre le
 * composeur avec cette carte déjà choisie ; la suite est un échange ordinaire.
 */
export function WikiCardOwnersList({
  name,
  card,
  friends,
  others,
  othersTotal,
  showFriends,
  block,
  othersBlocked,
  maxOffered,
  allowedRarities,
}: {
  name: string;
  card: CardView;
  friends: PlayerRef[];
  others: PlayerRef[];
  othersTotal: number;
  /** Le lecteur est un joueur inscrit : il a des amis à montrer. */
  showFriends: boolean;
  block: OwnersBlock;
  /** Échanges hors amis fermés par le réglage. */
  othersBlocked: boolean;
  maxOffered: number;
  allowedRarities: Rarity[];
}) {
  const t = useTranslations("wiki.owners");
  const [target, setTarget] = useState<PlayerRef | null>(null);

  const group = (id: string, title: string, seal: string | null, players: PlayerRef[], total: number, empty: string, canAsk: boolean) => (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 id={id} className="flex items-center gap-2 font-title text-xl font-bold">
          {seal && (
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              {seal}
            </span>
          )}
          {title}
        </h3>
        <span className="shrink-0 text-sm tabular-nums text-text-muted">{t("count", { count: total })}</span>
      </div>
      {players.length === 0 ? (
        <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {players.map((player) => (
            <li key={player.id} className="flex min-w-0 flex-col items-center gap-3 rounded-card border border-border bg-bg p-4 text-center">
              <Link href={`/u/${player.username}`} className="flex min-h-11 w-full min-w-0 flex-col items-center gap-2">
                <PlayerAvatar username={player.username} image={player.image} size={56} frame={player.decor.frame} />
                <PlayerName name={player.username} color={player.decor.nameColor} className="w-full truncate font-bold" />
              </Link>
              {canAsk && (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full px-3"
                  aria-label={t("requestLabel", { card: name, name: player.username })}
                  onClick={() => setTarget(player)}
                >
                  <span aria-hidden="true" lang="ja" className="font-seal">
                    換
                  </span>
                  {t("request")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {total > players.length && <p className="mt-3 text-sm text-text-muted">{t("othersMore", { count: total - players.length })}</p>}
    </section>
  );

  return (
    <section aria-labelledby="wiki-owners-title" className="min-w-0">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{t("kicker")}</p>
      <h2 id="wiki-owners-title" className="text-2xl font-extrabold md:text-3xl">
        {t("title", { name })}
      </h2>
      <div className="mt-5 flex flex-col gap-8 lacquer rounded-card p-4 md:p-6">
        {block && (
          <p role="status" className="rounded-control border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            {t(`block.${block}`)}
          </p>
        )}
        {showFriends && group("wiki-owners-friends", t("friends"), "友", friends, friends.length, t("friendsEmpty", { name }), block === null)}
        {group("wiki-owners-others", t("others"), null, others, othersTotal, t("othersEmpty", { name }), block === null && !othersBlocked)}
        {block === null && othersBlocked && others.length > 0 && <p className="-mt-4 text-xs text-text-muted">{t("othersClosed")}</p>}
      </div>

      {target && (
        <TradeComposer
          username={target.username}
          name={target.username}
          maxOffered={maxOffered}
          allowedRarities={allowedRarities}
          initialWanted={card}
          onClose={() => setTarget(null)}
        />
      )}
    </section>
  );
}

export function WikiCardOwnersSkeleton() {
  return (
    <div aria-hidden="true" className="min-w-0">
      <div className="mb-2 h-3 w-24 rounded-full bg-text-muted/20" />
      <div className="h-8 w-2/3 rounded-full bg-text-muted/20" />
      <div className="mt-5 grid animate-pulse grid-cols-2 gap-3 lacquer rounded-card p-4 sm:grid-cols-3 md:p-6 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-3 rounded-card border border-border bg-bg p-4">
            <div className="size-14 rounded-full bg-text-muted/20" />
            <div className="h-3 w-20 rounded-full bg-text-muted/20" />
            <div className="h-11 w-full rounded-pill bg-text-muted/20" />
          </div>
        ))}
      </div>
    </div>
  );
}
