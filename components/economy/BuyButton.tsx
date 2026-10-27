"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { primeAudio } from "@/lib/sound/synth";
import { buyShopItemAction, type EconomyActionError, type RewardSummary } from "@/server/actions/economy";
import type { BoosterLook } from "@/server/economy/lot-view";
import { ZeniCoin } from "../layout/ZeniCoin";
import { useRitualFx } from "../opening/useRitualFx";
import { useShopStage } from "../shop/ShopStage";
import { ButtonLink } from "../ui/ButtonLink";
import { Button } from "../ui/Button";
import { RewardText } from "./RewardText";

/**
 * Achat en Zeni en deux temps : un premier appui affiche le prix à confirmer (et ouvre l'éventail de la
 * carte, l'équivalent tactile du survol), le second achète. Le prix vu est envoyé au serveur, qui
 * refuse (STALE) s'il a changé entre-temps. La célébration est jouée par ShopStage, au-dessus de la
 * page : le refresh() qui suit l'achat peut re-rendre la carte sans couper la scène.
 */
export function BuyButton({
  shopItemId,
  price,
  affordable,
  remaining,
  openHref,
  celebration,
  describedBy,
  size = "md",
}: {
  shopItemId: string;
  price: number;
  affordable: boolean;
  /** Achats encore permis ; null = sans limite. Relu du serveur après chaque achat. */
  remaining: number | null;
  /** Lot de boosters : lien pour les ouvrir tout de suite après l'achat. */
  openHref?: string;
  /** Sachet et nom du type pour la célébration ; absent pour un lot sans booster. */
  celebration?: { look: BoosterLook; name: string };
  /** Id du titre de l'article : chaque « Acheter » se distingue des autres. */
  describedBy?: string;
  size?: "md" | "lg";
}) {
  const t = useTranslations("economy");
  const stage = useShopStage();
  const fx = useRitualFx();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reward, setReward] = useState<RewardSummary | null>(null);
  const [error, setError] = useState<EconomyActionError | "unexpected" | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const soldOut = remaining === 0;
  const blocked = soldOut || !affordable;

  // Après la célébration : le focus revient ici (le bouton de confirmation n'existe plus)
  const refocus = () => root.current?.querySelector<HTMLElement>("a, button:not(:disabled)")?.focus({ preventScroll: true }) ?? root.current?.focus();

  const buy = () => {
    // Le contexte audio doit naître pendant le geste (Safari) ; le son est joué au sceau
    if (fx.enabled) primeAudio();
    startTransition(async () => {
      setError(null);
      try {
        const res = await buyShopItemAction({ shopItemId, expectedPrice: price });
        setConfirming(false);
        if (res.ok) {
          stage.celebrate({
            reward: res.reward,
            coins: res.coins,
            spent: price,
            look: celebration?.look ?? null,
            name: celebration?.name ?? "",
            openHref: openHref ?? null,
            onClose: () => {
              setReward(res.reward);
              requestAnimationFrame(refocus);
            },
          });
        } else {
          setError(res.error);
        }
      } catch {
        setConfirming(false);
        setError("unexpected");
      }
    });
  };

  return (
    <div ref={root} tabIndex={-1} className="flex flex-col gap-2 outline-none" data-armed={confirming || undefined}>
      {soldOut ? (
        <p className="text-sm font-bold text-text-muted">{t("shop.soldOut")}</p>
      ) : confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size={size}
            onClick={buy}
            disabled={pending || blocked}
            aria-describedby={describedBy}
            className="flex-1"
          >
            <ZeniCoin size={14} />
            {pending ? t("shop.buying") : t("shop.confirm", { price })}
          </Button>
          <Button type="button" size={size} onClick={() => setConfirming(false)} disabled={pending}>
            {t("shop.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="primary"
          size={size}
          onClick={() => {
            setReward(null);
            setConfirming(true);
            // La scène est chargée pendant que le joueur confirme
            void import("../shop/PurchaseCelebration");
          }}
          disabled={blocked}
          aria-describedby={describedBy}
        >
          <ZeniCoin size={14} />
          {t("shop.buy")}
        </Button>
      )}
      {!affordable && !soldOut && <p className="text-xs text-text-muted">{t("shop.notEnough")}</p>}
      {reward && (
        <p className="text-sm font-bold text-kin" role="status">
          <RewardText reward={reward} />
        </p>
      )}
      {reward && reward.boosters > 0 && openHref && (
        <ButtonLink href={openHref} variant="primary" aria-describedby={describedBy}>
          {t("shop.openNow")}
        </ButtonLink>
      )}
      {error && (
        <p className="text-sm text-shu" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
