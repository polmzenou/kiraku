"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, NAV_KANJI, RAIL_GROUPS, visibleItems, type NavAlerts, type NavBadge, type NavBadges, type NavFeatures, type NavItem } from "@/lib/nav";
import { SealMark } from "../SealMark";
import { AlertDot } from "./NavLinks";

/**
 * Barre latérale de la navigation desktop (préférence « rail », lib/nav-layout.ts) : toutes les entrées
 * à plat, kanji au-dessus du libellé, en blocs séparés par un filet. Rendue en permanence, affichée
 * seulement quand <html data-nav="rail"> et ≥ 1024 px, pour basculer sans recharger la page.
 */
export function NavRail({ features, alerts = {}, badges = {} }: { features: NavFeatures; alerts?: NavAlerts; badges?: NavBadges }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col border-r border-border/60 bg-bg/95 lg:nav-rail:flex"
    >
      <Link prefetch={false} href="/" aria-label={t("home")} className="flex h-16 shrink-0 items-center justify-center">
        <SealMark glyphs="気楽" size={36} />
      </Link>
      <div className="flex-1 overflow-y-auto px-2 pb-4 [scrollbar-width:thin]">
        {RAIL_GROUPS.map((group, index) => {
          const items = visibleItems(group, features);
          if (items.length === 0) return null;
          return (
            <ul key={index} className="flex flex-col gap-0.5 border-t border-border/60 py-2 first:border-t-0 first:pt-0">
              {items.map((item) => (
                <li key={item.key}>
                  <RailLink item={item} active={isActive(item, pathname)} alert={alerts[item.key] === true} badge={badges[item.key]} />
                </li>
              ))}
            </ul>
          );
        })}
      </div>
    </nav>
  );
}

function RailLink({ item, active, alert, badge }: { item: NavItem; active: boolean; alert: boolean; badge?: NavBadge }) {
  const t = useTranslations("nav");
  const label = t(item.key);
  return (
    <Link prefetch={false}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:text-text"
    >
      {active && <span aria-hidden="true" className="absolute top-1/2 -left-2 h-6 w-1 -translate-y-1/2 rounded-r-pill bg-shu" />}
      <span aria-hidden="true" lang="ja" className="relative font-seal text-xl leading-none transition-colors group-hover:text-shu group-aria-[current=page]:text-shu">
        {NAV_KANJI[item.key]}
        {alert && <AlertDot className="-top-1 -right-2" />}
      </span>
      <span className="max-w-full truncate text-[11px] font-bold">{label}</span>
      {badge && <RailBadge badge={badge} />}
    </Link>
  );
}

/** « Nouveau » / « Bientôt » en version rail : un point doré, le texte reste lisible par les lecteurs d'écran. */
function RailBadge({ badge }: { badge: NavBadge }) {
  const t = useTranslations("nav");
  return (
    <>
      <span aria-hidden="true" className={`absolute top-1.5 right-2 size-2 rounded-full ${badge === "new" ? "bg-kin" : "bg-text-muted"}`} />
      <span className="sr-only">{t(badge)}</span>
    </>
  );
}
