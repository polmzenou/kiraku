"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

export type FamilyNavItem = { family: string; kanji: string; title: string; short: string; href: string };

// Tuile kanji + libellé court : la grille (4 colonnes, 8 en très large) montre toutes les familles d'un coup.
// Contour de focus rentré pour ne pas déborder de la piste.
const tileClass =
  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-card px-1 py-1.5 text-center text-[11px] font-bold leading-tight text-text-muted " +
  "transition-[background-color,color,transform] duration-150 hover:text-text active:scale-[.97] motion-reduce:transition-none " +
  "aria-[current=true]:bg-text aria-[current=true]:text-bg focus-visible:outline-offset-[-2px]";

/**
 * Onglets des familles de boosters, tous visibles sans défilement horizontal.
 * - Mobile : l'onglet filtre la grille de boosters affichée.
 * - Desktop : la grille reste collée en haut et l'onglet suit la section lue.
 */
export function FamilyNav({ items, active }: { items: FamilyNavItem[]; active: string | undefined }) {
  const t = useTranslations("boosters");
  const [spied, setSpied] = useState<string | null>(null);
  const current = spied ?? active;

  // Desktop : toutes les sections sont affichées, l'onglet suit celle qui passe sous la capsule
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    let observer: IntersectionObserver | null = null;
    const setup = () => {
      observer?.disconnect();
      observer = null;
      setSpied(null);
      if (!desktop.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (top) setSpied(top.target.id.replace("famille-", ""));
        },
        { rootMargin: "-140px 0px -55% 0px" },
      );
      for (const item of items) {
        const section = document.getElementById(`famille-${item.family}`);
        if (section) observer.observe(section);
      }
    };
    setup();
    desktop.addEventListener("change", setup);
    return () => {
      desktop.removeEventListener("change", setup);
      observer?.disconnect();
    };
  }, [items]);

  return (
    <nav aria-label={t("familiesLabel")} className="lg:sticky lg:top-[calc(4rem+env(safe-area-inset-top))] lg:z-20 lg:bg-bg/95 lg:py-2">
      <ul className="lacquer grid grid-cols-4 gap-0.5 rounded-card p-1 xl:grid-cols-8">
        {items.map((item) => (
          <li key={item.family} className="min-w-0">
            <Link
              prefetch={false}
              href={item.href}
              aria-current={item.family === current ? "true" : undefined}
              aria-label={item.title}
              className={tileClass}
            >
              <span aria-hidden="true" lang="ja" className="font-seal text-base leading-none text-shu">
                {item.kanji}
              </span>
              <span aria-hidden="true" className="w-full hyphens-auto [overflow-wrap:anywhere]">
                {item.short}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
