"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { SIDE_KANJI } from "@/lib/casino/media";
import { useRaritySeals } from "@/lib/catalog/use-rarities";
import { coinFlipFeedAction } from "@/server/actions/casino";
import type { FeedEntry } from "@/server/casino/queries";
import { Fuda } from "../fuda/Fuda";
import { usePoll } from "../realtime/usePoll";
import { PlayerName } from "../social/PlayerName";
import "./casino.css";

/** Fil « Derniers lancers » : qui a remporté quelle fuda, sur quelle face. Rafraîchi tant que le joueur est là. */
export function CoinFlipFeed({ initial, refreshSeconds, serverNow }: { initial: FeedEntry[]; refreshSeconds: number; serverNow: number }) {
  const t = useTranslations("casino.hall");
  const tRarity = useTranslations("rarity");
  const format = useFormatter();
  const seals = useRaritySeals();
  const [entries, setEntries] = useState(initial);
  const [now, setNow] = useState(serverNow);
  // Lignes arrivées par le sondage : elles entrent en glissant, pas celles du premier rendu
  const known = useRef(new Set(initial.map((e) => e.id)));
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());

  const poll = useCallback(async () => {
    setNow(Date.now());
    const res = await coinFlipFeedAction({});
    if (!res.ok) return false;
    const added = res.entries.filter((e) => !known.current.has(e.id)).map((e) => e.id);
    for (const id of added) known.current.add(id);
    setFresh(new Set(added));
    setEntries(res.entries);
    return added.length > 0;
  }, []);
  usePoll(poll, { seconds: refreshSeconds, backoff: true });

  // Seuls les lancers arrivés par le sondage sont annoncés : la liste, dont les « il y a n min » changent à chaque
  // sondage, n'est pas une région vivante
  const announced = entries.filter((e) => fresh.has(e.id));
  const live = (
    <p className="sr-only" aria-live="polite">
      {announced.map((e) => (
        <span key={e.id}>
          {t.rich("feedRow", { name: e.winner.username, card: e.prize.name, player: () => e.winner.username, b: (chunks) => chunks })}{" "}
        </span>
      ))}
    </p>
  );

  if (entries.length === 0)
    return (
      <>
        <p className="rounded-card bg-surface p-4 text-sm text-text-muted">{t("feedEmpty")}</p>
        {live}
      </>
    );

  return (
    <>
      {live}
      <ul className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <li
            key={e.id}
            className={`flex min-h-14 items-center gap-3 rounded-control bg-surface py-1 pr-3 pl-1 ${fresh.has(e.id) ? "cf-rise" : ""} ${e.big ? "ring-1 ring-kin/40 ring-inset" : ""}`}
          >
            <span className="w-9 shrink-0">
              <Fuda card={e.prize} size="sm" tilt={false} still />
            </span>
            <span className="flex min-w-0 flex-col text-sm leading-snug">
              <span className="truncate">
                {t.rich("feedRow", {
                  name: e.winner.username,
                  card: e.prize.name,
                  player: () => <PlayerName name={e.winner.username} color={e.winner.decor.nameColor} className="font-bold" />,
                  b: (chunks) => <b>{chunks}</b>,
                })}
              </span>
              <small className="truncate text-xs text-text-muted">
                <span aria-hidden="true" lang="ja" className="font-seal">
                  {seals[e.rarity]}
                </span>{" "}
                {t("feedMeta", { rarity: tRarity(e.rarity as "COMMON"), side: SIDE_KANJI[e.result] })} · {format.relativeTime(new Date(e.resolvedAt), now)}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
