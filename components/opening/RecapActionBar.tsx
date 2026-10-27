"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Price } from "@/lib/boosters/types";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button, buttonClasses } from "../ui/Button";

type Props = {
  count: number;
  nextPrice: Price;
  /** Sachets gratuits restants, affichés dans le bouton ; null pour les boosters crédités. */
  stock: number | null;
  /** Absent : rien d'autre à ouvrir ici (sachet scellé seul), le bouton ramène à l'accueil. */
  onAgain?: () => void;
  /** Accueil avec le booster et sa famille sélectionnés. */
  changeHref: string;
  reduced: boolean;
};

/**
 * Les actions du récap, sans avoir à descendre : posées au-dessus de la capsule de navigation sur
 * mobile (sous l'en-tête et la nav, au-dessus du récap), en rangée sous les cartes sur desktop. Un
 * espaceur garde le récap lisible jusqu'au bout.
 */
export function RecapActionBar({ count, nextPrice, stock, onAgain, changeHref, reduced }: Props) {
  const t = useTranslations("opening");
  const meta =
    nextPrice.kind === "free" ? (
      stock !== null ? t("freeLeft", { count: stock }) : t("free")
    ) : nextPrice.kind === "zeni" ? (
      <span className="inline-flex items-center gap-1.5">
        <ZeniCoin size={14} />
        {t("cost", { amount: nextPrice.amount })}
      </span>
    ) : (
      t("unavailable")
    );
  const secondary = buttonClasses("secondary", "w-full px-2 text-xs lg:w-auto lg:px-5 lg:text-sm", "md");
  return (
    <>
      <div aria-hidden="true" className="h-40 lg:hidden" />
      <m.nav
        aria-label={t("recapActions")}
        className="fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[var(--mobile-nav-height)] z-30 mx-auto flex max-w-md flex-col gap-2 rounded-hero border border-border bg-surface p-3 shadow-float lg:static lg:mt-8 lg:max-w-none lg:flex-row lg:flex-wrap lg:items-center lg:justify-center lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduced ? 0 : 0.8, duration: 0.3 }}
      >
        {onAgain ? (
          <Button
            variant="primary"
            size="lg"
            onClick={onAgain}
            disabled={nextPrice.kind === "unavailable"}
            className="w-full lg:w-auto lg:min-w-80"
            meta={meta}
          >
            <span className="font-title text-lg">{count > 1 ? t("openMore", { n: count }) : t("openAnother")}</span>
          </Button>
        ) : (
          <Link href="/" className={buttonClasses("primary", "w-full lg:w-auto lg:min-w-80", "lg")}>
            <span className="font-title text-lg">{t("backHome")}</span>
          </Link>
        )}
        <div className="grid grid-cols-3 gap-2 lg:flex lg:gap-3">
          <Link href={changeHref} className={secondary}>
            {t("changeBooster")}
          </Link>
          <Link href="/collection" className={secondary}>
            {t("toCollection")}
          </Link>
          <Link href="/wiki" className={secondary}>
            {t("toWiki")}
          </Link>
        </div>
      </m.nav>
    </>
  );
}
