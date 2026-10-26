import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { OpenCount } from "@/lib/boosters/catalog";
import type { Availability, Price } from "@/lib/boosters/types";
import { ZeniCoin } from "../layout/ZeniCoin";
import { buttonClasses } from "../ui/Button";

type Props = {
  slug: string;
  /** Nombre présélectionné sur la page d'ouverture (×1 / ×5 / ×10). */
  count?: OpenCount;
  price: Price;
  availability: Availability;
  stock: number;
  coins: number;
  /** À côté du sélecteur ×N sur mobile : marges serrées, l'information peut passer sur deux lignes. */
  compact?: boolean;
  className?: string;
};

/**
 * Gros bouton vermillon « Ouvrir | Gratuit · 7 restants » ou « Ouvrir | 300 Zeni ». Le paiement
 * n'est jamais déclenché ici : la page d'ouverture le fait confirmer avant la déchirure.
 */
export function OpenLink({ slug, count = 1, price, availability, stock, coins, compact = false, className = "" }: Props) {
  const t = useTranslations("boosters");

  if (availability === "locked") {
    return (
      <p
        className={`flex min-h-12 items-center justify-center rounded-control border border-dashed border-text-muted px-4 text-center text-sm text-text-muted ${className}`}
      >
        {t("eventOnly")}
      </p>
    );
  }

  const unaffordable = price.kind === "zeni" && coins < price.amount;
  const disabled = price.kind === "unavailable" || unaffordable;
  const detail =
    price.kind === "free" ? (
      t("remaining", { count: stock })
    ) : price.kind === "zeni" ? (
      <span className="inline-flex items-center gap-1.5">
        <ZeniCoin size={14} />
        {unaffordable ? t("notEnoughZeni") : t("pay", { amount: price.amount })}
      </span>
    ) : (
      t("emptyStock")
    );

  const content = (
    <>
      <span className="font-title text-lg font-bold">{t("open")}</span>
      <span aria-hidden="true" className="h-6 w-px bg-washi-paper/40" />
      <span className={`text-xs leading-tight ${compact ? "text-left whitespace-normal" : ""}`}>{detail}</span>
    </>
  );
  const classes = buttonClasses("primary", `min-h-12 w-full justify-center ${compact ? "gap-2.5 px-3!" : "gap-4"} ${className}`);

  if (disabled) {
    return (
      <span role="link" aria-disabled="true" className={`${classes} opacity-50`}>
        {content}
      </span>
    );
  }
  return (
    <Link href={count > 1 ? `/ouvrir/${slug}?n=${count}` : `/ouvrir/${slug}`} className={classes}>
      {content}
    </Link>
  );
}
