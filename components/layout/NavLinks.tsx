"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, MOBILE_NAV_MORE, NAV_ITEMS, NAV_MORE, visibleItems, type NavAlerts, type NavFeatures, type NavItem } from "@/lib/nav";
import { Badge } from "../ui/Badge";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/**
 * Entrées de la navigation. `layout="bar"` : barre horizontale du haut (≥ 1024 px), soulignement
 * vermillon sur la page active, Collection · Amis · Parrainage · Wiki dans le menu déroulant « Plus » ;
 * `layout="stack"` : liens secondaires du panneau mobile « Plus ».
 */
export function NavLinks({
  layout,
  features,
  alerts = {},
  onNavigate,
}: {
  layout: "bar" | "stack";
  features: NavFeatures;
  /** Pastille rouge sur les entrées qui attendent le joueur (mission à réclamer…). */
  alerts?: NavAlerts;
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
            <StackLink item={item} active={isActive(item, pathname)} alert={alerts[item.key] === true} onNavigate={onNavigate} />
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
      <li>
        <MoreMenu pathname={pathname} items={visibleItems(NAV_MORE, features)} alerts={alerts} />
      </li>
    </ul>
  );
}

function StackLink({ item, active, alert, onNavigate }: { item: NavItem; active: boolean; alert: boolean; onNavigate?: () => void }) {
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
        {item.soon && <SoonBadge />}
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

/** Rangée de 52 px des listes de liens (panneau « Plus » mobile). */
export const stackRowClass =
  "flex min-h-13 items-center justify-between gap-3 rounded-control px-3.5 text-base text-text-muted transition-colors hover:bg-surface-2 hover:text-text " +
  "aria-[current=page]:bg-surface-2 aria-[current=page]:font-bold aria-[current=page]:text-text";

/** Menu déroulant « Plus » de la barre du haut : se ferme au clic dehors, à Échap et en changeant de page. */
function MoreMenu({ pathname, items, alerts }: { pathname: string; items: readonly NavItem[]; alerts: NavAlerts }) {
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
        <AlertLabel alert={items.some((item) => alerts[item.key] === true)}>{t("more")}</AlertLabel>
        <span aria-hidden="true" className={`flex transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      <ul
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-50 mt-2 flex min-w-52 flex-col gap-0.5 rounded-card border border-border bg-surface p-1.5 shadow-float"
      >
        {items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.key}>
              <Link prefetch={false}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center justify-between gap-3 rounded-control px-3.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text aria-[current=page]:font-bold aria-[current=page]:text-text"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertLabel alert={alerts[item.key] === true}>{t(item.key)}</AlertLabel>
                  {item.soon && <SoonBadge />}
                </span>
                {active && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
