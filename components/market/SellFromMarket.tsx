"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CollectionItem } from "@/lib/collection/view";
import { sellInfoForRarity, type SellBase } from "@/lib/market/rules";
import { CardPickGrid } from "../collection/CardPickGrid";
import { Fuda } from "../fuda/Fuda";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { SellForm, useSellBlockReason } from "./SellForm";

const NONE: ReadonlySet<string> = new Set();

/**
 * « Mettre en vente » depuis le Marché, en deux temps : la carte (dans sa collection), puis le même
 * formulaire que la fiche carte, avec le plafond de sa rareté. Le serveur revérifie tout.
 */
export function SellFromMarket({ base }: { base: SellBase }) {
  const t = useTranslations("market");
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<CollectionItem | null>(null);
  const [sold, setSold] = useState(false);
  const reason = useSellBlockReason(base);

  const close = () => {
    setOpen(false);
    setCard(null);
    setSold(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="primary" className="self-start" onClick={() => setOpen(true)} disabled={reason !== null}>
        {t("sell.fromMarket")}
      </Button>
      {reason && <p className="text-xs text-text-muted">{reason}</p>}

      {open && (
        <Sheet open onClose={close} title={card ? t("sell.title", { card: card.name }) : t("sell.pickTitle")} wide>
          {card ? (
            <div className="flex flex-col gap-4 md:grid md:grid-cols-[9rem_1fr] md:items-start md:gap-6">
              <div className="flex items-end gap-3 md:flex-col md:items-stretch">
                <div className="w-28 md:w-full">
                  <Fuda card={card} series={card.series} size="sm" tilt={false} />
                </div>
                {!sold && (
                  <Button type="button" onClick={() => setCard(null)}>
                    {t("sell.changeCard")}
                  </Button>
                )}
              </div>
              <SellForm cardId={card.cardId} info={sellInfoForRarity(base, card.rarity)} onSold={() => setSold(true)} />
            </div>
          ) : (
            <>
              <p className="text-sm text-text-muted">{t("sell.pickHint")}</p>
              <CardPickGrid
                selected={NONE}
                unavailable={(item) => item.free === 0}
                pickLabel={(name) => t("sell.pickCard", { card: name })}
                onPick={setCard}
              />
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
