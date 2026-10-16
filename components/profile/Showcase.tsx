"use client";

import { LazyMotion, m, MotionConfig } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { Link } from "@/i18n/navigation";
import { placeInSlot, slotAtPoint, swapSlots } from "@/lib/collection/showcase";
import type { CollectionItem, ShowcaseCard } from "@/lib/collection/view";
import { setShowcaseAction } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { ShowcasePicker } from "./ShowcasePicker";
import { loadDomMax } from "../motion/load-features";

type Slot = ShowcaseCard | null;

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-button border border-border bg-surface-2 text-lg disabled:opacity-30";

const cardSizes = "(min-width: 1200px) 274px, (min-width: 768px) calc((100vw - 104px) / 4), calc((100vw - 44px) / 2)";

/**
 * Vitrine du profil (4 cartes par défaut). En mode édition, chaque carte se glisse au doigt vers
 * une autre case (échange) ; les boutons ← → × et la case vide (+) font la même chose au clavier.
 * Mise à jour immédiate à l'écran, enregistrement en arrière-plan, retour en arrière si refus.
 */
export function Showcase({ initial, editable, linkBase }: { initial: Slot[]; editable: boolean; linkBase: "/collection" | "/wiki" }) {
  const t = useTranslations("showcase");
  const [slots, setSlots] = useState<Slot[]>(initial);
  const saved = useRef<Slot[]>(initial);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const cells = useRef<(HTMLLIElement | null)[]>([]);

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

  const withPositions = (list: Slot[]) => list.map((s, i) => (s ? { ...s, position: i + 1 } : null));

  const swap = (from: number, to: number) => save(withPositions(swapSlots(slots, from, to)));

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

  if (!editable && isEmpty) return <p className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">{t("emptyPublic")}</p>;

  return (
    <LazyMotion features={loadDomMax} strict>
      <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-3">
          <ol
            aria-label={t("label")}
            className="grid w-full grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-6 md:gap-y-6"
          >
            {slots.map((card, i) => (
              <li
                key={i}
                ref={(el) => {
                  cells.current[i] = el;
                }}
                className="relative flex min-w-0 flex-col gap-2"
              >
                <span className="sr-only">{t("slot", { n: i + 1 })}</span>
                {card ? (
                  editing ? (
                    <m.div
                      layoutId={`showcase-${card.cardId}`}
                      drag
                      dragSnapToOrigin
                      dragElastic={0.9}
                      dragMomentum={false}
                      whileDrag={{ scale: 1.06, zIndex: 20 }}
                      onDragEnd={(_, info) => dropAt(i, info.point)}
                      style={{ touchAction: "none" }}
                      className="relative cursor-grab rounded-[5px] ring-2 ring-ai/60 ring-offset-2 ring-offset-bg active:cursor-grabbing"
                    >
                      <Fuda card={card} series={card.series} size="md" sizes={cardSizes} tilt={false} />
                    </m.div>
                  ) : (
                    <m.div layoutId={`showcase-${card.cardId}`}>
                      <Link href={`${linkBase}/${card.anilistId}`} prefetch={false} scroll={false} className="block rounded-[5px]">
                        <Fuda card={card} series={card.series} size="md" sizes={cardSizes} preload={i < 2} />
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

                {editing && card && (
                  <div className="grid grid-cols-3 gap-1 max-md:hidden">
                    <button type="button" aria-label={t("moveLeft", { name: card.name })} disabled={i === 0 || pending} onClick={() => swap(i, i - 1)} className={iconButton}>
                      <span aria-hidden="true">←</span>
                    </button>
                    <button type="button" aria-label={t("remove", { name: card.name })} disabled={pending} onClick={() => save(withPositions(slots.map((s, j) => (j === i ? null : s))))} className={iconButton}>
                      <span aria-hidden="true">×</span>
                    </button>
                    <button type="button" aria-label={t("moveRight", { name: card.name })} disabled={i === slots.length - 1 || pending} onClick={() => swap(i, i + 1)} className={iconButton}>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
                {editing && card && (
                  <div className="flex flex-col gap-1 md:hidden">
                    <button type="button" aria-label={t("change", { name: card.name })} onClick={() => setPicking(i)} className="min-h-11 rounded-button border border-border bg-surface-2 text-xs">
                      {t("changeShort")}
                    </button>
                    <button type="button" aria-label={t("remove", { name: card.name })} disabled={pending} onClick={() => save(withPositions(slots.map((s, j) => (j === i ? null : s))))} className="min-h-11 rounded-button border border-border text-xs text-text-muted">
                      {t("removeShort")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant={editing ? "shu" : "neutral"} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                {editing ? t("done") : t("edit")}
              </Button>
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
      </MotionConfig>
    </LazyMotion>
  );
}
