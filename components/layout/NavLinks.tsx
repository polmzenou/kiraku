"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, MOBILE_NAV_MORE, NAV_ITEMS, NAV_MORE, type NavItem } from "@/lib/nav";

/**
 * Entrées de la navigation. `layout="bar"` : barre horizontale du haut (≥ 1024 px), soulignement
 * vermillon sur la page active, Collection · Amis · Parrainage · Wiki dans le menu déroulant « Plus » ;
 * `layout="stack"` : liens secondaires du panneau mobile « Plus ».
 */
export function NavLinks({ layout, onNavigate }: { layout: "bar" | "stack"; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const bar = layout === "bar";

  if (!bar) {
    return (
      <ul className="flex flex-col">
        {MOBILE_NAV_MORE.map((item) => (
          <li key={item.key}>
            <StackLink item={item} active={isActive(item, pathname)} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex items-center gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const base = "relative inline-flex min-h-11 items-center gap-1.5 px-2 text-sm whitespace-nowrap";
        if (!item.ready) {
          return (
            <li key={item.key}>
              <span aria-disabled="true" className={`${base} text-text-muted/70`}>
                {t(item.key)}
                <span className="hidden rounded-sm border border-border px-1.5 text-[10px] tracking-wide uppercase xl:inline">
                  {t("soon")}
                </span>
              </span>
            </li>
          );
        }
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${base} ${active ? "font-bold text-text" : "text-text-muted hover:text-text"}`}
            >
              {t(item.key)}
              {active && <span aria-hidden="true" className="absolute inset-x-2.5 bottom-1 h-[3px] rounded-full bg-shu" />}
            </Link>
          </li>
        );
      })}
      <li>
        <MoreMenu pathname={pathname} />
      </li>
    </ul>
  );
}

function StackLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const base = "flex min-h-12 items-center justify-between gap-3 border-b border-border px-1 text-base";
  if (!item.ready) {
    return (
      <span aria-disabled="true" className={`${base} text-text-muted/70`}>
        {t(item.key)}
        <span className="rounded-sm border border-border px-1.5 text-[10px] tracking-wide uppercase">{t("soon")}</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`${base} ${active ? "font-bold text-text" : "text-text-muted hover:text-text"}`}
    >
      {t(item.key)}
      {active && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
    </Link>
  );
}

/** Menu déroulant « Plus » de la barre du haut : se ferme au clic dehors, à Échap et en changeant de page. */
function MoreMenu({ pathname }: { pathname: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const activeChild = NAV_MORE.some((item) => isActive(item, pathname));

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
        className={`relative inline-flex min-h-11 items-center gap-1 px-2 text-sm whitespace-nowrap ${
          activeChild ? "font-bold text-text" : "text-text-muted hover:text-text"
        }`}
      >
        {t("more")}
        <span aria-hidden="true" className={`text-[10px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
        {activeChild && <span aria-hidden="true" className="absolute inset-x-2.5 bottom-1 h-[3px] rounded-full bg-shu" />}
      </button>
      <ul
        id={panelId}
        hidden={!open}
        className="absolute top-full left-0 z-50 mt-1 flex min-w-48 flex-col overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_12px_32px_rgb(0_0_0/0.35)]"
      >
        {NAV_MORE.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center justify-between gap-3 px-4 text-sm hover:bg-surface-2 ${
                  active ? "font-bold text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {t(item.key)}
                {active && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
