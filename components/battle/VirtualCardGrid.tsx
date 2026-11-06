"use client";

import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Grille de cartes du combat (choix d'équipe, decks, atelier), virtualisée par lignes : seules les lignes
// proches de l'écran sont dans le DOM. Une fuda de haute rareté porte des calques d'effet en
// mix-blend-mode : quelques centaines montées d'un coup suffisent à faire tuer l'onglet par iOS, faute de
// mémoire (« Un problème récurrent est survenu »). Le défilement est celui de la feuille (<dialog>) qui
// contient la grille, sinon celui de la fenêtre.

/** Colonnes alignées sur l'ancienne grille : grid-cols-3, sm:4, md:5, xl:6 (largeur de la fenêtre). */
export function gridColumns(viewportWidth: number): number {
  return viewportWidth >= 1280 ? 6 : viewportWidth >= 768 ? 5 : viewportWidth >= 640 ? 4 : 3;
}

const GAP = 8;
/** Lignes gardées de part et d'autre de l'écran, pour que le défilement ne montre jamais de trou. */
const OVERSCAN = 3;
/**
 * Hauteur prévue sous la carte (stats, technique, ulti et passifs) avant que la ligne soit mesurée : une
 * carte rare porte 3 ou 4 passifs (~110 px à 375 px), une commune une seule ligne.
 */
const META_HEIGHT = 90;
/** Avant la mise en page (rendu serveur, première image) : quelques cartes seulement, en grille CSS. */
export const FIRST_PAINT_ITEMS = 12;

type Layout = { scroller: HTMLElement | null; cols: number; width: number; top: number };

type Props<T> = {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
};

/** Grille de cartes virtualisée. Chaque carte est un `listitem` ; la liste entière n'est jamais montée. */
export function VirtualCardGrid<T>({ items, itemKey, renderItem }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // La feuille du choix d'équipe défile elle-même ; ailleurs, c'est la fenêtre
    const scroller = el.closest("dialog");
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const top = scroller ? rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop : rect.top + window.scrollY;
      const next: Layout = { scroller, cols: gridColumns(window.innerWidth), width: el.clientWidth, top: Math.round(top) };
      setLayout((cur) =>
        cur && cur.scroller === next.scroller && cur.cols === next.cols && cur.width === next.width && cur.top === next.top ? cur : next,
      );
    };
    measure();
    // Le parent change de taille quand un bloc au-dessus de la grille s'ouvre ou se ferme (lexique, filtres)
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.parentElement) observer.observe(el.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div ref={ref} role="list" className="relative w-full">
      {layout === null ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
          {items.slice(0, FIRST_PAINT_ITEMS).map((item) => (
            <div key={itemKey(item)} role="listitem">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : layout.scroller ? (
        <InElement layout={layout} scroller={layout.scroller} items={items} itemKey={itemKey} renderItem={renderItem} />
      ) : (
        <InWindow layout={layout} items={items} itemKey={itemKey} renderItem={renderItem} />
      )}
    </div>
  );
}

function rowsOf(layout: Layout, count: number) {
  const colWidth = Math.max(0, (layout.width - GAP * (layout.cols - 1)) / layout.cols);
  return { rows: Math.ceil(count / layout.cols), estimate: Math.max(60, Math.round((colWidth * 7) / 5) + META_HEIGHT + GAP) };
}

function InElement<T>({ layout, scroller, ...props }: Props<T> & { layout: Layout; scroller: HTMLElement }) {
  const { rows, estimate } = rowsOf(layout, props.items.length);
  // Le compilateur React ne mémoïse pas ce composant : c'est voulu, les lignes suivent le défilement à chaque rendu
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    overscan: OVERSCAN,
    scrollMargin: layout.top,
  });
  return <Rows virtualizer={virtualizer} cols={layout.cols} {...props} />;
}

function InWindow<T>({ layout, ...props }: Props<T> & { layout: Layout }) {
  const { rows, estimate } = rowsOf(layout, props.items.length);
  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => estimate,
    overscan: OVERSCAN,
    scrollMargin: layout.top,
  });
  return <Rows virtualizer={virtualizer} cols={layout.cols} {...props} />;
}

function Rows<T, S extends Element | Window>({ virtualizer, cols, items, itemKey, renderItem }: Props<T> & { virtualizer: Virtualizer<S, Element>; cols: number }) {
  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0 grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            columnGap: GAP,
            paddingBottom: GAP,
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {items.slice(row.index * cols, row.index * cols + cols).map((item) => (
            <div key={itemKey(item)} role="listitem">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
