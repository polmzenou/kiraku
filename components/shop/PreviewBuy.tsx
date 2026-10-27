"use client";

import { useTranslations } from "next-intl";
import type { BoosterLook } from "@/server/economy/lot-view";
import { Button } from "../ui/Button";
import { useShopStage } from "./ShopStage";

/** Aperçu de développement (/boutique/apercu) : rejoue la célébration d'un achat, sans rien acheter. */
export function PreviewBuy({
  celebration,
  price,
  size = "md",
}: {
  celebration: { look: BoosterLook; name: string; quantity: number } | null;
  price: number;
  size?: "md" | "lg";
}) {
  const t = useTranslations("economy.shop.preview");
  const stage = useShopStage();
  return (
    <Button
      type="button"
      variant="primary"
      size={size}
      disabled={!celebration}
      onClick={() =>
        celebration &&
        stage.celebrate({
          reward: { zeni: 0, boosters: celebration.quantity, cards: [] },
          coins: Math.max(0, 12_345 - price),
          spent: price,
          look: celebration.look,
          name: celebration.name,
          openHref: null,
        })
      }
    >
      {t("replay")}
    </Button>
  );
}
