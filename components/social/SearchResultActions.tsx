"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Rarity } from "@/lib/catalog/rarity";
import type { Relation } from "@/lib/social/relation";
import { respondFriendRequestAction, sendFriendRequestAction } from "@/server/actions/social";
import { Button } from "../ui/Button";
import { TradeComposer } from "./TradeComposer";

/**
 * Actions d'un résultat de la recherche de joueurs (page Social), sans passer par le profil :
 * ajouter ou accepter en ami, proposer un échange. La relation change tout de suite (mise à jour
 * optimiste) et revient en arrière si le serveur refuse ; il revérifie tout à l'envoi.
 */
export function SearchResultActions({
  username,
  initial,
  trade,
}: {
  username: string;
  initial: Relation;
  /** Échange possible avec ce joueur (même règle que son profil) : cartes offertes au plus et raretés. */
  trade: { maxOffered: number; allowedRarities: Rarity[] } | null;
}) {
  const t = useTranslations("friends");
  const [relation, setRelation] = useState<Relation>(initial);
  const [error, setError] = useState<string | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const add = () => {
    const before = relation;
    setRelation("OUTGOING");
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendFriendRequestAction({ username });
        if (!res.ok) {
          setRelation(before);
          setError(t(`errors.${res.error}`));
        } else if (res.status === "ACCEPTED") setRelation("FRIENDS");
      } catch {
        setRelation(before);
        setError(t("errors.UNAVAILABLE"));
      }
    });
  };

  const accept = () => {
    setRelation("FRIENDS");
    setError(null);
    startTransition(async () => {
      try {
        const res = await respondFriendRequestAction({ username, accept: true });
        if (!res.ok) {
          setRelation("INCOMING");
          setError(t(`errors.${res.error}`));
        }
      } catch {
        setRelation("INCOMING");
        setError(t("errors.UNAVAILABLE"));
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {relation === "NONE" && (
          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={add}>
            {t("add")}
          </Button>
        )}
        {relation === "OUTGOING" && <span className="text-xs text-text-muted">{t("requestPending")}</span>}
        {relation === "INCOMING" && (
          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={accept}>
            {t("accept")}
          </Button>
        )}
        {relation === "FRIENDS" && (
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              友
            </span>
            {t("isFriend")}
          </span>
        )}
        {trade && relation !== "BLOCKED_BY_ME" && (
          <Button type="button" size="sm" onClick={() => setTradeOpen(true)} aria-label={t("tradeWith", { name: username })}>
            <span aria-hidden="true" lang="ja" className="font-seal text-shu">
              換
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              {t("trade")}
            </span>
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-shu">
          {error}
        </p>
      )}

      {trade && tradeOpen && (
        <TradeComposer
          username={username}
          name={username}
          maxOffered={trade.maxOffered}
          allowedRarities={trade.allowedRarities}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </div>
  );
}
