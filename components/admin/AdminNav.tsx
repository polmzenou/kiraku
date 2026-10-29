"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { CatalogScope } from "@/lib/admin/roles";

const GROUPS = [
  { key: "overview", modules: [{ key: "dashboard", href: "/admin" }, { key: "journal", href: "/admin/journal" }] },
  {
    key: "settings",
    modules: [
      { key: "general", href: "/admin/general" },
      { key: "features", href: "/admin/fonctionnalites" },
      { key: "economy", href: "/admin/economie" },
      { key: "combat", href: "/admin/combat" },
      { key: "ranked", href: "/admin/classe" },
    ],
  },
  {
    key: "content",
    modules: [
      { key: "catalog", href: "/admin/catalogue" },
      { key: "collection", href: "/admin/collection" },
      { key: "boosters", href: "/admin/boosters" },
      { key: "types", href: "/admin/boosters/types" },
      { key: "openingTest", href: "/admin/test-ouverture" },
      { key: "banners", href: "/admin/bannieres" },
      { key: "focus", href: "/admin/focus" },
      { key: "cosmetics", href: "/admin/cosmetiques" },
      { key: "lots", href: "/admin/lots" },
      { key: "missions", href: "/admin/missions" },
      { key: "shop", href: "/admin/boutique" },
    ],
  },
  {
    key: "players",
    modules: [
      { key: "users", href: "/admin/utilisateurs" },
      { key: "social", href: "/admin/social" },
      { key: "referral", href: "/admin/parrainage" },
      { key: "reviews", href: "/admin/avis" },
      { key: "pullFeed", href: "/admin/gros-tirages" },
      { key: "market", href: "/admin/marche" },
    ],
  },
  {
    key: "compliance",
    modules: [
      { key: "legal", href: "/admin/legal" },
      { key: "data", href: "/admin/donnees" },
      { key: "discord", href: "/admin/discord" },
    ],
  },
] as const;

type Module = (typeof GROUPS)[number]["modules"][number];
const MODULES: readonly Module[] = GROUPS.flatMap((g): readonly Module[] => g.modules);
const HREFS: string[] = MODULES.map((m) => m.href);

/** Module actif : le lien le plus long qui préfixe la page (/admin/boosters/types n'allume pas /admin/boosters). */
function activeHref(pathname: string) {
  return HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`)).sort((a, b) => b.length - a.length)[0];
}

/** Modules ouverts au DEV : le reste lui répond 404 côté serveur, la nav ne fait que le refléter. */
const DEV_MODULES: readonly string[] = ["catalog"];

/**
 * Navigation de l'admin : barre latérale groupée et collante en desktop (≥ 1024 px),
 * rangée de puces défilante sur mobile.
 */
export function AdminNav({ scope }: { scope: CatalogScope }) {
  const t = useTranslations("admin");
  const active = activeHref(usePathname());
  const visible = (m: Module) => scope === "full" || DEV_MODULES.includes(m.key);
  const groups = GROUPS.map((g) => ({ key: g.key, modules: g.modules.filter(visible) })).filter((g) => g.modules.length > 0);

  return (
    <nav aria-label={t("modules")} className="min-w-0 lg:sticky lg:top-[calc(4rem+env(safe-area-inset-top))] lg:max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] lg:overflow-y-auto lg:py-6">
      {/* Mobile : une rangée qui défile */}
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
        {MODULES.filter(visible).map((m) => (
          <li key={m.key} className="shrink-0 snap-start">
            <Link
              href={m.href}
              aria-current={m.href === active ? "page" : undefined}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-pill border border-border bg-surface px-4 text-sm font-bold text-text-muted aria-[current=page]:border-shu aria-[current=page]:bg-shu/15 aria-[current=page]:text-text"
            >
              {t(`moduleNames.${m.key}`)}
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop : groupes empilés */}
      <div className="hidden flex-col gap-5 rounded-card border border-border bg-surface p-3 lg:flex">
        {groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-1">
            <h2 className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{t(`navGroups.${g.key}`)}</h2>
            <ul className="flex flex-col">
              {g.modules.map((m) => (
                <li key={m.key}>
                  <Link
                    href={m.href}
                    aria-current={m.href === active ? "page" : undefined}
                    className="relative flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:font-bold aria-[current=page]:text-text before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-shu before:opacity-0 aria-[current=page]:before:opacity-100"
                  >
                    {t(`moduleNames.${m.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
