import { useTranslations } from "next-intl";
import type { BoosterTypeView } from "@/lib/boosters/types";
import { ZeniCoin } from "../layout/ZeniCoin";

/** Prix de base d'un booster sur sa tuile : 無料 · Gratuit, pièce + montant, ou 催事 · Événement. */
export function PriceTag({ type, className = "" }: { type: Pick<BoosterTypeView, "usesFreeStock" | "priceZeni">; className?: string }) {
  const t = useTranslations("boosters.price");
  if (type.usesFreeStock) {
    return (
      <span className={`flex items-center justify-center gap-1 text-xs font-bold text-shu ${className}`}>
        <span aria-hidden="true" lang="ja" className="font-seal">
          無料
        </span>
        <span aria-hidden="true">·</span>
        {t("free")}
      </span>
    );
  }
  if (type.priceZeni !== null) {
    return (
      <span className={`flex items-center justify-center gap-1.5 text-xs font-bold text-kin ${className}`}>
        <ZeniCoin size={14} />
        {t("zeni", { amount: type.priceZeni })}
      </span>
    );
  }
  return (
    <span className={`flex items-center justify-center gap-1 text-xs font-bold text-ai ${className}`}>
      <span aria-hidden="true" lang="ja" className="font-seal">
        催事
      </span>
      <span aria-hidden="true">·</span>
      {t("event")}
    </span>
  );
}
