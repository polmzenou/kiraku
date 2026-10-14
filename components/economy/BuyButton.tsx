"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { buyShopItemAction, type EconomyActionError, type RewardSummary } from "@/server/actions/economy";
import { ZeniCoin } from "../layout/ZeniCoin";
import { ButtonLink } from "../ui/ButtonLink";
import { Button } from "../ui/Button";
import { RewardText } from "./RewardText";

// La scène de révélation (Motion) n'est chargée que lorsqu'une carte est achetée
const CardReveal = dynamic(() => import("./CardReveal").then((m) => m.CardReveal), { ssr: false });

/**
 * Achat en Zeni en deux temps : un premier appui affiche le prix à confirmer, le second achète.
 * Le prix vu est envoyé au serveur, qui refuse (STALE) s'il a changé entre-temps.
 */
export function BuyButton({
  shopItemId,
  price,
  affordable,
  remaining,
  openHref,
}: {
  shopItemId: string;
  price: number;
  affordable: boolean;
  /** Achats encore permis ; null = sans limite. */
  remaining: number | null;
  /** Lot de boosters : lien pour les ouvrir tout de suite après l'achat. */
  openHref?: string;
}) {
  const t = useTranslations("economy");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [left, setLeft] = useState(remaining);
  const [reveal, setReveal] = useState<OpenedCardView[] | null>(null);
  const [error, setError] = useState<EconomyActionError | "unexpected" | null>(null);

  const buy = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await buyShopItemAction({ shopItemId, expectedPrice: price });
        setConfirming(false);
        if (res.ok) {
          setReward(res.reward);
          if (res.reward.cards.length > 0) setReveal(res.reward.cards);
          setLeft((l) => (l === null ? null : Math.max(0, l - 1)));
        } else {
          setError(res.error);
        }
      } catch {
        setConfirming(false);
        setError("unexpected");
      }
    });

  const soldOut = left === 0;
  return (
    <div className="flex flex-col gap-2">
      {soldOut ? (
        <p className="text-sm font-bold text-text-muted">{t("shop.soldOut")}</p>
      ) : confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="shu" onClick={buy} disabled={pending} className="flex-1">
            <ZeniCoin size={14} />
            {pending ? t("shop.buying") : t("shop.confirm", { price })}
          </Button>
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            {t("shop.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="shu"
          onClick={() => {
            setReward(null);
            setConfirming(true);
          }}
          disabled={!affordable}
        >
          <ZeniCoin size={14} />
          {t("shop.buy", { price })}
        </Button>
      )}
      {!affordable && !soldOut && <p className="text-xs text-text-muted">{t("shop.notEnough")}</p>}
      {reward && (
        <p className="text-sm font-bold text-kin" role="status">
          <RewardText reward={reward} />
        </p>
      )}
      {reward && reward.boosters > 0 && openHref && (
        <ButtonLink href={openHref} variant="shu">
          {t("shop.openNow")}
        </ButtonLink>
      )}
      {error && (
        <p className="text-sm text-shu" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
      {reveal && <CardReveal cards={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
