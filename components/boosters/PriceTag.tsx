import { useTranslations } from "next-intl";
import { priceFor, type BoosterTypeView } from "@/lib/boosters/types";
import { ZeniCoin } from "../layout/ZeniCoin";

/** Prix de la prochaine ouverture : gratuit disponible, gratuit épuisé + Zeni, ou événement. */
export function PriceTag({ type, stock, className = "" }: {
  type: Pick<BoosterTypeView, "usesFreeStock" | "priceZeni">;
  stock: number;
  className?: string;
}) {
  const t = useTranslations("boosters.price");
  const price = priceFor(type, stock, 1);

  if (type.usesFreeStock || price.kind === "zeni") {
    return (
      <span className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-bold ${className}`}>
        {type.usesFreeStock && (
          <span className={`inline-flex items-center gap-1 ${price.kind === "free" ? "text-shu" : "text-text-muted"}`}>
            <span aria-hidden="true" lang="ja" className="font-seal">
              無料
            </span>
            <span aria-hidden="true">·</span>
            {t("free")}
          </span>
        )}
        {price.kind === "zeni" && (
          <span className="inline-flex items-center gap-1.5 text-kin">
            <ZeniCoin size={14} />
            {t("zeni", { amount: price.amount })}
          </span>
        )}
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
