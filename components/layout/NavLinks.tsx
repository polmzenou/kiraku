"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, MOBILE_NAV_MORE, NAV_GROUPS, NAV_ITEMS, NAV_KANJI, visibleItems, type NavAlerts, type NavBadge, type NavBadges, type NavFeatures, type NavGroup, type NavItem } from "@/lib/nav";
import { Badge } from "../ui/Badge";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/**
 * Entrées de la navigation. `layout="bar"` : barre horizontale du haut (≥ 1024 px) : Boosters et
 * Collection en accès direct, puis les menus groupés Jouer · Échanger · Communauté (NAV_GROUPS) ;
 * `layout="stack"` : liens secondaires du panneau mobile « Plus ».
 */
export function NavLinks({
  layout,
  features,
  alerts = {},
  badges = {},
  onNavigate,
}: {
  layout: "bar" | "stack";
  features: NavFeatures;
  /** Pastille rouge sur les entrées qui attendent le joueur (mission à réclamer…). */
  alerts?: NavAlerts;
  /** « Bientôt » ou « Nouveau » à côté d'une entrée (casino). */
  badges?: NavBadges;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const bar = layout === "bar";

  if (!bar) {
    return (
      <ul className="flex flex-col gap-1">
        {visibleItems(MOBILE_NAV_MORE, features).map((item) => (
          <li key={item.key}>
            <StackLink item={item} active={isActive(item, pathname)} alert={alerts[item.key] === true} badge={badges[item.key]} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={segmentedTrackClass}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const base = segmentedItemClass;
        if (!item.ready) {
          return (
            <li key={item.key}>
              <span aria-disabled="true" className={`${base} text-text-muted/70`}>
                {t(item.key)}
                <SoonBadge />
              </span>
            </li>
          );
        }
        return (
          <li key={item.key}>
            <Link prefetch={false}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={base}
            >
              <AlertLabel alert={alerts[item.key] === true}>{t(item.key)}</AlertLabel>
            </Link>
          </li>
        );
      })}
      {NAV_GROUPS.map((group) => {
        const items = visibleItems(group.items, features);
        if (items.length === 0) return null;
        return (
          <li key={group.key}>
            <GroupMenu pathname={pathname} group={group} items={items} alerts={alerts} badges={badges} />
          </li>
        );
      })}
    </ul>
  );
}

function StackLink({ item, active, alert, badge, onNavigate }: { item: NavItem; active: boolean; alert: boolean; badge?: NavBadge; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const base = stackRowClass;
  if (!item.ready) {
    return (
      <span aria-disabled="true" className={`${base} text-text-muted/70`}>
        {t(item.key)}
        <SoonBadge />
      </span>
    );
  }
  return (
    <Link prefetch={false}
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={base}
    >
      <span className="inline-flex items-center gap-2">
        <AlertLabel alert={alert}>{t(item.key)}</AlertLabel>
        <EntryBadge badge={badge} />
      </span>
      {active && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
    </Link>
  );
}

/** Point rouge collé en haut à droite d'un libellé ou d'une icône ; annoncé aux lecteurs d'écran. */
export function AlertDot({ className = "-top-1 -right-2.5" }: { className?: string }) {
  const t = useTranslations("nav");
  return (
    <>
      <span aria-hidden="true" className={`pointer-events-none absolute size-2.5 rounded-full bg-shu ring-2 ring-surface ${className}`} />
      <span className="sr-only">{t("alert")}</span>
    </>
  );
}

function AlertLabel({ alert, children }: { alert: boolean; children: string }) {
  if (!alert) return <>{children}</>;
  return (
    <span className="relative">
      {children}
      <AlertDot />
    </span>
  );
}

function SoonBadge() {
  const t = useTranslations("nav");
  return <Badge tone="muted" className="uppercase tracking-wide">{t("soon")}</Badge>;
}

/** « Bientôt » (page d'attente) ou « Nouveau » (lancement récent), à côté du libellé. */
function EntryBadge({ badge }: { badge?: NavBadge }) {
  const t = useTranslations("nav");
  if (badge === "soon") return <SoonBadge />;
  if (badge === "new") return <Badge tone="kin" className="uppercase tracking-wide">{t("new")}</Badge>;
  return null;
}

/** Rangée de 52 px des listes de liens (panneau « Plus » mobile). */
export const stackRowClass =
  "flex min-h-13 items-center justify-between gap-3 rounded-control px-3.5 text-base text-text-muted transition-colors hover:bg-surface-2 hover:text-text " +
  "aria-[current=page]:bg-surface-2 aria-[current=page]:font-bold aria-[current=page]:text-text";

/** Menu déroulant d'un groupe de la barre du haut : se ferme au clic dehors, à Échap et en changeant de page. */
function GroupMenu({ pathname, group, items, alerts, badges }: { pathname: string; group: NavGroup; items: readonly NavItem[]; alerts: NavAlerts; badges: NavBadges }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const activeChild = items.some((item) => isActive(item, pathname));

  // Changement de page : le menu se referme (comparé au rendu, sans effet)
  if (open && openedAt !== pathname) {
    setOpen(false);
    setOpenedAt(pathname);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpenedAt(pathname);
          setOpen((o) => !o);
        }}
        aria-current={activeChild ? "true" : undefined}
        className={segmentedItemClass}
      >
        <AlertLabel alert={items.some((item) => alerts[item.key] === true)}>{t(`groups.${group.key}`)}</AlertLabel>
        <span aria-hidden="true" className={`flex transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full left-0 z-50 mt-2 w-80 rounded-card border border-border bg-surface p-1.5 shadow-float"
      >
        <p className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-xs font-bold tracking-wide text-text-muted uppercase">
          <span aria-hidden="true" lang="ja" className="font-seal text-base leading-none text-shu normal-case">{group.kanji}</span>
          {t(`groups.${group.key}`)}
        </p>
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.key}>
              <GroupLink item={item} active={isActive(item, pathname)} alert={alerts[item.key] === true} badge={badges[item.key]} onNavigate={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Rangée d'un menu groupé : kanji de l'entrée, libellé et une ligne de description. */
function GroupLink({ item, active, alert, badge, onNavigate }: { item: NavItem; active: boolean; alert: boolean; badge?: NavBadge; onNavigate: () => void }) {
  const t = useTranslations("nav");
  return (
    <Link prefetch={false}
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className="group flex min-h-14 items-center gap-3 rounded-control px-2.5 py-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:text-text"
    >
      <span
        aria-hidden="true"
        lang="ja"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-control border border-border bg-bg font-seal text-xl leading-none text-text-muted transition-colors group-hover:text-shu group-aria-[current=page]:border-shu/50 group-aria-[current=page]:text-shu"
      >
        {NAV_KANJI[item.key]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <AlertLabel alert={alert}>{t(item.key)}</AlertLabel>
          <EntryBadge badge={badge} />
        </span>
        <span className="truncate text-xs text-text-muted">{t(`desc.${item.key}`)}</span>
      </span>
      {active && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-shu" />}
    </Link>
  );
}
