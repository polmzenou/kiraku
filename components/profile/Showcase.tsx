"use client";

import { LazyMotion, m, MotionConfig } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import { placeInSlot, slotAtPoint, swapSlots } from "@/lib/collection/showcase";
import { isHero, type ShowcaseLayout } from "@/lib/collection/showcase-layouts";
import type { CollectionItem, ShowcaseCard } from "@/lib/collection/view";
import { setShowcaseAction, setShowcaseLayoutAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { OwnedBadge } from "../collection/OwnedBadge";
import { ShowcasePicker } from "./ShowcasePicker";
import { ShowcaseLayoutSheet } from "./ShowcaseLayoutSheet";
import { layoutStyle } from "./showcase-layout-style";
import { loadDomMax } from "../motion/load-features";
import "./ShowcaseLayout.css";

type Slot = ShowcaseCard | null;

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface-2 text-lg disabled:opacity-30";

const gridSizes = "(min-width: 1200px) 274px, (min-width: 768px) calc((100vw - 104px) / 4), calc((100vw - 44px) / 2)";
// Dispositions : la vedette tient jusqu'à ~400 px, les autres cartes ~190 px
const heroSizes = "(min-width: 768px) 400px, 75vw";
const smallSizes = "(min-width: 768px) 190px, 30vw";

/**
 * Vitrine du profil, dans la disposition choisie par son propriétaire (grille par défaut, ou une
 * mise en page à 8 cartes avec vedette). En mode édition, chaque carte se glisse au doigt vers une
 * autre case (échange) ; les boutons et la case vide (+) font la même chose au clavier.
 * Mise à jour immédiate à l'écran, enregistrement en arrière-plan, retour en arrière si refus.
 */
export function Showcase({ initial, editable, linkBase, owned = [], layout: initialLayout = "GRID", layoutsEnabled = false }: {
  initial: Slot[];
  editable: boolean;
  linkBase: "/collection" | "/wiki";
  /** Vitrine d'un autre joueur : cartes que le visiteur possède déjà. */
  owned?: string[];
  /** Disposition en vigueur (déjà ramenée à la grille si la vitrine n'a pas 8 cases). */
  layout?: ShowcaseLayout;
  /** Vitrine de 8 cases : le propriétaire peut changer de disposition. */
  layoutsEnabled?: boolean;
}) {
  const t = useTranslations("showcase");
  const [slots, setSlots] = useState<Slot[]>(initial);
  const saved = useRef<Slot[]>(initial);
  const [layout, setLayout] = useState<ShowcaseLayout>(initialLayout);
  const savedLayout = useRef<ShowcaseLayout>(initialLayout);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [choosingLayout, setChoosingLayout] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const cells = useRef<(HTMLLIElement | null)[]>([]);
  const grid = layout === "GRID";

  const save = (next: Slot[]) => {
    setSlots(next);
    setError(false);
    startTransition(async () => {
      try {
        const res = await setShowcaseAction({ slots: next.map((s) => s?.cardId ?? null) });
        if (!res.ok) throw new Error(res.error);
        saved.current = next;
      } catch {
        setSlots(saved.current);
        setError(true);
      }
    });
  };

  const chooseLayout = (next: ShowcaseLayout) => {
    setChoosingLayout(false);
    if (next === layout) return;
    setLayout(next);
    setError(false);
    startTransition(async () => {
      try {
        const res = await setShowcaseLayoutAction({ layout: next });
        if (!res.ok) throw new Error(res.error);
        savedLayout.current = next;
      } catch {
        setLayout(savedLayout.current);
        setError(true);
      }
    });
  };

  const withPositions = (list: Slot[]) => list.map((s, i) => (s ? { ...s, position: i + 1 } : null));

  const swap = (from: number, to: number) => save(withPositions(swapSlots(slots, from, to)));
  const remove = (index: number) => save(withPositions(slots.map((s, j) => (j === index ? null : s))));

  const pick = (item: CollectionItem) => {
    if (picking === null) return;
    const ids = placeInSlot(slots.map((s) => s?.cardId ?? null), picking, item.cardId);
    const byId = new Map(slots.flatMap((s) => (s ? [[s.cardId, s] as const] : [])));
    byId.set(item.cardId, { ...item, position: picking + 1 });
    save(withPositions(ids.map((id) => (id ? byId.get(id)! : null))));
    setPicking(null);
  };

  const dropAt = (from: number, point: { x: number; y: number }) => {
    const rects = cells.current.map((el) => {
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: 0, height: 0 };
    });
    // Motion donne la position dans la page ; les rectangles sont dans la fenêtre
    const to = slotAtPoint(point.x - window.scrollX, point.y - window.scrollY, rects);
    if (to >= 0 && to !== from) swap(from, to);
  };

  const shownIds = new Set(slots.flatMap((s) => (s ? [s.cardId] : [])));
  const isEmpty = shownIds.size === 0;

  if (!editable && isEmpty) return <p className="lacquer rounded-card p-4 text-sm text-text-muted">{t("emptyPublic")}</p>;

  return (
    <LazyMotion features={loadDomMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-3">
          <ol
            aria-label={t("label")}
            className={grid ? "grid w-full grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-6 md:gap-y-6" : "showcase-layout"}
            style={layoutStyle(layout)}
          >
            {slots.map((card, i) => {
              const hero = isHero(layout, i);
              const sizes = grid ? gridSizes : hero ? heroSizes : smallSizes;
              const fudaSize = hero ? "lg" : grid || layout === "CHECKER" ? "md" : "sm";
              return (
                <li
                  key={i}
                  ref={(el) => {
                    cells.current[i] = el;
                  }}
                  data-slot={i + 1}
                  data-hero={hero || undefined}
                  className="relative flex min-w-0 flex-col gap-2"
                >
                  <span className="sr-only">{hero ? t("slotHero", { n: i + 1 }) : t("slot", { n: i + 1 })}</span>
                  {card ? (
                    editing ? (
                      <m.div
                        layoutId={`showcase-${card.cardId}`}
                        layout="position"
                        drag
                        dragSnapToOrigin
                        dragElastic={0.9}
                        dragMomentum={false}
                        whileDrag={{ scale: 1.06, zIndex: 20 }}
                        onDragEnd={(_, info) => dropAt(i, info.point)}
                        style={{ touchAction: "none" }}
                        className="relative cursor-grab rounded-[5px] ring-2 ring-ai/60 ring-offset-2 ring-offset-bg active:cursor-grabbing"
                      >
                        <Fuda card={card} series={card.series} size={fudaSize} sizes={sizes} tilt={false} />
                      </m.div>
                    ) : (
                      <m.div layoutId={`showcase-${card.cardId}`} layout="position">
                        <Link href={`${linkBase}/${card.anilistId}`} prefetch={false} scroll={false} className="block rounded-[5px]">
                          <Fuda card={card} series={card.series} size={fudaSize} sizes={sizes} preload={grid ? i < 2 : hero || i === 0} corner={owned.includes(card.cardId) && <OwnedBadge />} />
                        </Link>
                      </m.div>
                    )
                  ) : editable && editing ? (
                    <button
                      type="button"
                      onClick={() => setPicking(i)}
                      aria-label={t("addTo", { n: i + 1 })}
                      className="flex aspect-[5/7] w-full items-center justify-center rounded-[5px] border-2 border-dashed border-border text-3xl text-text-muted"
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  ) : (
                    <div aria-hidden="true" className="aspect-[5/7] w-full rounded-[5px] border border-dashed border-border bg-surface" />
                  )}

                  {/* Grille : flèches sur ordinateur. Dispositions (cartes parfois étroites) : Changer / Retirer partout */}
                  {editing && card && grid && (
                    <div className="grid grid-cols-3 gap-1 max-md:hidden">
                      <button type="button" aria-label={t("moveLeft", { name: card.name })} disabled={i === 0 || pending} onClick={() => swap(i, i - 1)} className={iconButton}>
                        <span aria-hidden="true">←</span>
                      </button>
                      <button type="button" aria-label={t("remove", { name: card.name })} disabled={pending} onClick={() => remove(i)} className={iconButton}>
                        <span aria-hidden="true">×</span>
                      </button>
                      <button type="button" aria-label={t("moveRight", { name: card.name })} disabled={i === slots.length - 1 || pending} onClick={() => swap(i, i + 1)} className={iconButton}>
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  )}
                  {editing && card && (
                    <div className={`flex flex-col gap-1 ${grid ? "md:hidden" : ""}`}>
                      <button type="button" aria-label={t("change", { name: card.name })} onClick={() => setPicking(i)} className="min-h-11 rounded-control border border-border bg-surface-2 text-xs">
                        {t("changeShort")}
                      </button>
                      <button type="button" aria-label={t("remove", { name: card.name })} disabled={pending} onClick={() => remove(i)} className="min-h-11 rounded-control border border-border text-xs text-text-muted">
                        {t("removeShort")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant={editing ? "primary" : "secondary"} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                {editing ? t("done") : t("edit")}
              </Button>
              {editing && layoutsEnabled && (
                <Button type="button" onClick={() => setChoosingLayout(true)} aria-haspopup="dialog">
                  {t("layoutButton")}
                </Button>
              )}
              {editing && <p className="text-sm text-text-muted">{t("dragHint")}</p>}
              {!editing && isEmpty && <p className="text-sm text-text-muted">{t("emptyOwner", { count: slots.length })}</p>}
            </div>
          )}
          <p role="status" className="text-sm text-shu">
            {error ? t("error") : ""}
          </p>
        </div>

        {editable && picking !== null && (
          <ShowcasePicker onClose={() => setPicking(null)} onPick={pick} shownIds={shownIds} />
        )}
        {editable && layoutsEnabled && choosingLayout && (
          <ShowcaseLayoutSheet current={layout} onChoose={chooseLayout} onClose={() => setChoosingLayout(false)} />
        )}
      </MotionConfig>
    </LazyMotion>
  );
}
