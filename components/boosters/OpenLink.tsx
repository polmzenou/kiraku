import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { BoosterSlug } from "@/lib/boosters/catalog";
import { buttonClasses } from "../ui/Button";

/** Gros bouton vermillon « Ouvrir | Gratuit · 7 restants », désactivé quand le stock est vide. */
export function OpenLink({ slug, stock, className = "" }: { slug: BoosterSlug; stock: number; className?: string }) {
  const t = useTranslations("boosters");
  const content = (
    <>
      <span className="font-title text-lg font-bold">{t("open")}</span>
      <span aria-hidden="true" className="h-6 w-px bg-washi-paper/40" />
      <span className="text-xs leading-tight">{stock > 0 ? t("remaining", { count: stock }) : t("emptyStock")}</span>
    </>
  );
  const classes = buttonClasses("shu", `min-h-12 w-full justify-between ${className}`);

  if (stock < 1) {
    return (
      <span role="link" aria-disabled="true" className={`${classes} opacity-50`}>
        {content}
      </span>
    );
  }
  return (
    <Link href={`/ouvrir/${slug}`} className={classes}>
      {content}
    </Link>
  );
}
