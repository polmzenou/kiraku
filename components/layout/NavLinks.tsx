"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isActive, NAV_ITEMS } from "@/lib/nav";

/**
 * Entrées de la navigation. `layout="bar"` : barre horizontale du haut (≥ 1024 px), soulignement
 * vermillon sur la page active ; `layout="stack"` : liste verticale du menu burger.
 */
export function NavLinks({ layout, onNavigate }: { layout: "bar" | "stack"; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const bar = layout === "bar";

  return (
    <ul className={bar ? "flex items-center gap-1" : "flex flex-col"}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const base = bar
          ? "relative inline-flex min-h-11 items-center gap-1.5 px-3 text-sm"
          : "flex min-h-12 items-center justify-between gap-3 border-b border-border px-1 text-base";

        if (!item.ready) {
          return (
            <li key={item.key}>
              <span aria-disabled="true" className={`${base} text-text-muted/70`}>
                {t(item.key)}
                <span className="rounded-sm border border-border px-1.5 text-[10px] uppercase tracking-wide">{t("soon")}</span>
              </span>
            </li>
          );
        }
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`${base} ${active ? "font-bold text-text" : "text-text-muted hover:text-text"}`}
            >
              {t(item.key)}
              {bar && active && (
                <span aria-hidden="true" className="absolute inset-x-3 bottom-1 h-[3px] rounded-full bg-shu" />
              )}
              {!bar && active && <span aria-hidden="true" className="size-2 rounded-full bg-shu" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
