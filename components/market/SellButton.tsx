"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { SellInfo } from "@/lib/market/rules";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { SellForm, useSellBlockReason } from "./SellForm";

/** « Mettre en vente » depuis la fiche d'une carte ; le formulaire est partagé avec le Marché (SellForm). */
export function SellButton({ cardId, cardName, available, info }: { cardId: string; cardName: string; available: number; info: SellInfo }) {
  const t = useTranslations("market");
  const [open, setOpen] = useState(false);
  // Le formulaire, et la lecture des exemplaires par CopyPicker, n'existent qu'à partir de la première ouverture
  const [opened, setOpened] = useState(false);
  const reason = useSellBlockReason(info, available);

  return (
    <>
      <Button type="button" onClick={() => {
          setOpen(true);
          setOpened(true);
        }} disabled={reason !== null}>
        {t("sell.button")}
      </Button>
      {reason && <p className="text-xs text-text-muted">{reason}</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title={t("sell.title", { card: cardName })}>
        {opened && <SellForm cardId={cardId} info={info} />}
      </Sheet>
    </>
  );
}
