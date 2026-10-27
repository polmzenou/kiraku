import { useTranslations } from "next-intl";
import { ZeniCoin } from "../layout/ZeniCoin";

/**
 * Prix d'un article : prix barré et remise lus d'un seul tenant par les lecteurs d'écran (un prix barré
 * n'est pas annoncé comme tel), visuel caché.
 */
export function PackPrice({
  price,
  reference,
  discount,
  affordable,
  size = "md",
}: {
  price: number;
  reference: number | null;
  discount: number | null;
  affordable: boolean;
  size?: "md" | "lg";
}) {
  const t = useTranslations("economy.shop");
  const big = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="sr-only">
        {reference !== null && discount !== null ? t("priceSr", { price, reference, discount }) : t("price", { amount: price })}
      </span>
      {reference !== null && (
        <s aria-hidden="true" className="text-sm text-text-muted tabular-nums">
          {t("amount", { amount: reference })}
        </s>
      )}
      <span aria-hidden="true" className="flex items-baseline gap-1.5 text-sm text-text-muted">
        <ZeniCoin size={size === "lg" ? 22 : 18} />
        {t.rich("priceRich", {
          amount: price,
          n: (chunks) => <span className={`${big} font-bold tabular-nums ${affordable ? "text-kin" : "text-text-muted"}`}>{chunks}</span>,
        })}
      </span>
    </p>
  );
}

/** « De nouveau disponible dans 3 jours » sous un article dont la limite est atteinte. */
export function ResetHint({ resetsAt, now }: { resetsAt: Date | null; now: Date }) {
  const t = useTranslations("economy.shop.pack");
  if (!resetsAt) return null;
  // Jours arrondis au-dessus : « dans 5 jours » un mercredi pour une remise à zéro lundi à minuit
  const ms = Math.max(0, resetsAt.getTime() - now.getTime());
  return (
    <p className="text-xs text-text-muted">
      {ms >= 86_400_000 ? t("resetsDays", { days: Math.ceil(ms / 86_400_000) }) : t("resetsHours", { hours: Math.floor(ms / 3_600_000) })}
    </p>
  );
}
