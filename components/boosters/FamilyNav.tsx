"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";

export type FamilyNavItem = { family: string; kanji: string; title: string; count: number; href: string };

/**
 * Onglets des familles de boosters.
 * - Mobile : capsule défilante (fondus aux bords, onglet actif recentré) et bouton « Toutes » qui
 *   ouvre une grille de toutes les familles : rien n'est hors d'atteinte.
 * - Desktop : toutes les pastilles visibles (retour à la ligne), l'onglet suit la section lue.
 */
export function FamilyNav({ items, active }: { items: FamilyNavItem[]; active: string | undefined }) {
  const t = useTranslations("boosters");
  const track = useRef<HTMLUListElement>(null);
  const [spied, setSpied] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const current = spied ?? active;

  // Recentrer l'onglet actif dans la capsule (sans faire défiler la page)
  useEffect(() => {
    const ul = track.current;
    const li = ul?.querySelector<HTMLElement>(`[data-family="${active}"]`);
    if (!ul || !li || ul.scrollWidth <= ul.clientWidth) return;
    ul.scrollTo({ left: li.offsetLeft - (ul.clientWidth - li.offsetWidth) / 2 });
  }, [active]);

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
    <nav
      aria-label={t("familiesLabel")}
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 flex items-center gap-2 bg-bg/95 px-4 py-2 md:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0"
    >
      <ul
        ref={track}
        className={`${segmentedTrackClass} min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(90deg,transparent,#000_1.25rem,#000_calc(100%-1.25rem),transparent)] lg:flex-none lg:flex-wrap lg:overflow-visible lg:rounded-hero lg:[mask-image:none]`}
      >
        {items.map((item) => (
          <li key={item.family} data-family={item.family} className="shrink-0">
            <Link
              prefetch={false}
              href={item.href}
              aria-current={item.family === current ? "true" : undefined}
              className={segmentedItemClass}
            >
              <span aria-hidden="true" lang="ja" className="font-seal text-[15px] text-shu">
                {item.kanji}
              </span>
              {item.title}
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setAllOpen(true)}
        className="lacquer inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-sm font-bold active:scale-[.97] motion-reduce:active:scale-100 lg:hidden"
        aria-haspopup="dialog"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
          <rect x="1" y="1" width="6" height="6" rx="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" />
        </svg>
        {t("allFamilies")}
      </button>

      <Sheet open={allOpen} onClose={() => setAllOpen(false)} title={t("familiesLabel")}>
        <ul className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <li key={item.family}>
              <Link
                prefetch={false}
                href={item.href}
                onClick={() => setAllOpen(false)}
                aria-current={item.family === active ? "true" : undefined}
                className="lacquer flex min-h-16 items-center gap-3 rounded-card px-3 py-2 aria-[current=true]:border-shu"
              >
                <span aria-hidden="true" lang="ja" className="w-8 shrink-0 text-center font-seal text-xl leading-tight text-shu">
                  {item.kanji}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold">{item.title}</span>
                  <span className="text-xs text-text-muted">{t("familyCount", { count: item.count })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </nav>
  );
}
