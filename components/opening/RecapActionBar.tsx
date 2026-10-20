"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { OpenCount } from "@/lib/boosters/catalog";
import type { Price } from "@/lib/boosters/types";
import { ZeniCoin } from "../layout/ZeniCoin";
import { Button, buttonClasses } from "../ui/Button";

type Props = {
  count: OpenCount;
  nextPrice: Price;
  onAgain: () => void;
  /** Accueil avec le booster et sa famille sélectionnés. */
  changeHref: string;
  reduced: boolean;
};

/**
 * Les actions du récap, sans avoir à descendre : posées au-dessus de la capsule de navigation sur
 * mobile, collées au bas de l'écran sur desktop. Un espaceur garde le récap lisible jusqu'au bout.
 */
export function RecapActionBar({ count, nextPrice, onAgain, changeHref, reduced }: Props) {
  const t = useTranslations("opening");
  return (
    <>
      <div aria-hidden="true" className="h-40 lg:hidden" />
      <m.nav
        aria-label={t("recapActions")}
        className="fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[var(--mobile-nav-height)] z-[55] mx-auto flex max-w-md flex-col gap-2 rounded-hero border border-border bg-surface p-3 shadow-float lg:sticky lg:inset-x-auto lg:bottom-4 lg:mt-6 lg:max-w-2xl lg:flex-row lg:items-center"
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduced ? 0 : 0.9, duration: 0.3 }}
      >
        <Button variant="primary" onClick={onAgain} disabled={nextPrice.kind === "unavailable"} className="w-full justify-between lg:flex-1">
          <span className="font-title text-lg font-bold">{count > 1 ? t("openMore", { n: count }) : t("openAnother")}</span>
          <span className="inline-flex items-center gap-1.5 text-xs">
            {nextPrice.kind === "zeni" && <ZeniCoin size={14} />}
            {nextPrice.kind === "free" ? t("free") : nextPrice.kind === "zeni" ? t("cost", { amount: nextPrice.amount }) : t("unavailable")}
          </span>
        </Button>
        <div className="grid grid-cols-3 gap-2 lg:flex lg:shrink-0">
          <Link href={changeHref} className={buttonClasses("secondary", "w-full px-2 text-xs lg:px-4", "sm")}>
            {t("changeBooster")}
          </Link>
          <Link href="/collection" className={buttonClasses("secondary", "w-full px-2 text-xs lg:px-4", "sm")}>
            {t("toCollection")}
          </Link>
          <Link href="/wiki" className={buttonClasses("secondary", "w-full px-2 text-xs lg:px-4", "sm")}>
            {t("toWiki")}
          </Link>
        </div>
      </m.nav>
    </>
  );
}
