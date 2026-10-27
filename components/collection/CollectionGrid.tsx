"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import type { CollectionItem, CollectionPage } from "@/lib/collection/view";
import { loadCollectionPage } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { useCollectionStore } from "./CollectionStore";
import { OwnedBadge } from "./OwnedBadge";

// Colonnes alignées sur la grille du wiki : 3 · 4 (≥ 768) · 6 (≥ 1024) · 8 (≥ 1280)
function columnsFor(width: number) {
  return width >= 1280 ? 8 : width >= 1024 ? 6 : width >= 768 ? 4 : 3;
}
const gapFor = (width: number) => (width >= 768 ? 12 : 8);

// Avant l'hydratation (rendu serveur) : un téléphone de 375 px, contenu à 343 px
const SSR_WIDTH = 343;

function CollectionCard({ item, href, preload }: { item: CollectionItem; href: string; preload: boolean }) {
  const t = useTranslations("collection");
  return (
    <Link
      href={href}
      scroll={false}
      className="relative block rounded-[5px] transition-transform active:scale-[0.97] motion-reduce:transition-none"
    >
      {/* Pastilles posées sur la carte : elles s'inclinent avec elle */}
      <Fuda
        card={item}
        series={item.series}
        size="sm"
        preload={preload}
        corner={
          (item.copies > 1 || item.viewerOwns) && (
            <>
              {item.copies > 1 && (
                <span aria-hidden="true" className="rounded-sm bg-sumi/85 px-1 text-[11px] font-bold tabular-nums text-washi-paper">
                  ×{item.copies}
                </span>
              )}
              {item.viewerOwns && <OwnedBadge />}
            </>
          )
        }
        overlay={
          item.inShowcase && (
            <span className="absolute bottom-6 left-1 rounded-sm bg-kin px-1 text-[10px] font-bold text-sumi">
              {t("inShowcaseBadge")}
            </span>
          )
        }
      />
      <span className="sr-only">{t("copiesLabel", { count: item.copies })}</span>
    </Link>
  );
}

/**
 * Liste de la collection, virtualisée par lignes (TanStack Virtual) : seules les lignes à l'écran
 * sont dans le DOM, même avec des milliers de cartes. La première page vient du serveur, la suite
 * se charge en approchant du bas. `username` : collection publique d'un autre joueur (lecture seule).
 */
export function CollectionGrid({
  initial,
  query,
  username,
  linkBase,
}: {
  initial: CollectionPage;
  query: Record<string, string>;
  username?: string;
  linkBase: "/collection" | "/wiki";
}) {
  const t = useTranslations("collection");
  const { patches } = useCollectionStore();
  const listRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState(initial.items);
  const [nextOffset, setNextOffset] = useState(initial.nextOffset);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState({ width: SSR_WIDTH, cols: 3, gap: 8, top: 0 });

  // Largeur réelle du conteneur et position dans la page (marge de défilement du virtualiseur)
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const vw = window.innerWidth;
      setLayout({
        width: el.clientWidth,
        cols: columnsFor(vw),
        gap: gapFor(vw),
        top: el.getBoundingClientRect().top + window.scrollY,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { cols, gap, width } = layout;
  const colWidth = (width - gap * (cols - 1)) / cols;
  const rowHeight = Math.round((colWidth * 7) / 5) + gap;
  const rows = Math.ceil(items.length / cols);

  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: layout.top,
    initialRect: { width: 375, height: 812 },
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const loadMore = useCallback(async () => {
    if (loading || nextOffset === null) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await loadCollectionPage({ username, query, offset: nextOffset });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      // Une carte déjà affichée (liste modifiée entre deux pages) n'est pas répétée
      setItems((current) => {
        const seen = new Set(current.map((i) => i.cardId));
        return [...current, ...res.items.filter((i) => !seen.has(i.cardId))];
      });
      setNextOffset(res.nextOffset);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, nextOffset, query, username]);

  const virtualRows = virtualizer.getVirtualItems();

  // Repère sous la liste : la page suivante se charge quand il approche de l'écran
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || failed || nextOffset === null) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadMore();
    }, { rootMargin: "1200px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [failed, nextOffset, loadMore]);

  return (
    <div className="flex flex-col gap-4">
      <div ref={listRef} role="list" aria-label={t("listLabel")} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => (
          <div
            key={row.key}
            className="absolute inset-x-0 top-0 grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              columnGap: gap,
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {items.slice(row.index * cols, row.index * cols + cols).map((item, i) => {
              const patched = { ...item, ...patches[item.cardId] };
              return (
                <div key={item.cardId} role="listitem">
                  <CollectionCard
                    item={patched}
                    href={`${linkBase}/${item.anilistId}`}
                    preload={row.index === 0 && i < 3}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div ref={sentinel} aria-hidden="true" />
      <div aria-live="polite" className="flex justify-center">
        {loading && <p className="text-sm text-text-muted">{t("loading")}</p>}
        {failed && (
          <Button type="button" onClick={() => void loadMore()}>
            {t("retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
