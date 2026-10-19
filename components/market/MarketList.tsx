"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { loadMarketPageAction } from "@/server/actions/market";
import type { AuctionListItem } from "@/server/market/queries";
import { Button } from "../ui/Button";
import { AuctionTile } from "./AuctionTile";

/**
 * Grille des ventes : la première page vient du serveur, la suite par curseur (« Voir plus »).
 * `query` = paramètres d'URL déjà filtrés, renvoyés tels quels au serveur qui les revalide.
 */
export function MarketList({
  initial,
  nextCursor: firstCursor,
  query,
  serverNow,
  emptyText,
}: {
  initial: AuctionListItem[];
  nextCursor: string | null;
  query: Record<string, string>;
  serverNow: number;
  emptyText: string;
}) {
  const t = useTranslations("market");
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(firstCursor);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  // Nouveau rendu serveur (filtres changés) : il fait foi
  const [rendered, setRendered] = useState(initial);
  if (rendered !== initial) {
    setRendered(initial);
    setItems(initial);
    setCursor(firstCursor);
    setFailed(false);
  }

  const more = () =>
    startTransition(async () => {
      if (!cursor) return;
      setFailed(false);
      try {
        const res = await loadMarketPageAction({ params: query, cursor });
        if (!res.ok) return setFailed(true);
        setItems((list) => [...list, ...res.items.filter((i) => !list.some((x) => x.id === i.id))]);
        setCursor(res.nextCursor);
      } catch {
        setFailed(true);
      }
    });

  if (items.length === 0) {
    return <p className="lacquer rounded-card p-6 text-center text-text-muted">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 md:gap-3 lg:grid-cols-6">
        {items.map((item, i) => (
          <li key={item.id}>
            <AuctionTile item={item} serverNow={serverNow} preload={i < 4} />
          </li>
        ))}
      </ul>
      {cursor && (
        <Button type="button" onClick={more} disabled={pending} className="self-center">
          {pending ? t("loading") : t("more")}
        </Button>
      )}
      {failed && (
        <p role="alert" className="text-center text-sm text-shu">
          {t("loadFailed")}
        </p>
      )}
    </div>
  );
}
