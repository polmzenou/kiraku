"use client";

import { domAnimation, LazyMotion, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { cellOf } from "@/lib/fresco/grid";
import { frescoProgress, type FrescoDropView } from "@/lib/fresco/view";
import { useReducedFx } from "@/components/motion/MotionPreference";
import { CardReveal } from "../economy/CardReveal";
import { useFrescoLabel } from "../fresco/FrescoPlate";
import { FrescoView } from "../fresco/FrescoView";
import { Button } from "../ui/Button";
import { FrescoRewardList } from "./FrescoRecap";

type Drop = FrescoDropView<OpenedCardView>;

/** Contenu d'une révélation : la fresque où le fragment se pose, sa place, la progression et les récompenses. */
function FragmentCard({ drop, onCards }: { drop: Drop; onCards?: (cards: OpenedCardView[]) => void }) {
  const t = useTranslations("fresco");
  const label = useFrescoLabel();
  const reduced = useReducedFx();
  const { owned, total, complete } = frescoProgress(drop.fresco);
  const { row, col } = cellOf(drop.position, drop.fresco);
  const cards = drop.rewards.flatMap((r) => r.reward?.cards ?? []);
  const lines = drop.rewards.filter((r) => r.kind !== "PIECE");
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <p className="flex items-center gap-2 font-title text-lg font-bold">
        <span aria-hidden="true" lang="ja" className="font-seal text-kin">
          絵
        </span>
        {t("fragment")}
      </p>
      <m.div
        className="w-full"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduced ? 0.2 : 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <FrescoView fresco={drop.fresco} label={label(drop.fresco)} fresh={drop.position} />
      </m.div>
      <div className="flex flex-col items-center gap-0.5">
        <h2 className="font-heading text-xl font-extrabold">{drop.fresco.name}</h2>
        <p className="text-sm text-text-muted">
          {t("newFragment")} · {t("position", { row: row + 1, col: col + 1 })}
        </p>
        <p className={`text-sm font-bold tabular-nums ${complete ? "text-kin" : ""}`}>{complete ? t("complete") : t("progress", { owned, total })}</p>
      </div>
      {lines.length > 0 && (
        <m.p
          className="rounded-sm border-2 border-shu px-3 py-1 font-heading text-base text-shu"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.4, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ delay: reduced ? 0 : 0.6, duration: 0.3 }}
        >
          <span aria-hidden="true" lang="ja" className="mr-1.5 font-seal">
            {complete ? "完" : "絵"}
          </span>
          {t(`rewardKinds.${lines[lines.length - 1].kind}`, { index: lines[lines.length - 1].index + 1 })}
        </m.p>
      )}
      <FrescoRewardList drop={drop} />
      {cards.length > 0 && onCards && (
        <Button type="button" variant="secondary" onClick={() => onCards(cards)}>
          {t("revealCards", { count: cards.length })}
        </Button>
      )}
    </div>
  );
}

/**
 * Fragments de fresque tombés pendant l'ouverture, montrés après les cartes, un à la fois : le fragment se pose
 * sur sa case, puis viennent la progression et les lots. Un <dialog> natif (focus piégé, Échap pour passer).
 * `inline` : sans fenêtre, pour l'aperçu de l'admin.
 */
export function FrescoFragmentReveal({ drops, onDone, inline = false, start = 0 }: { drops: Drop[]; onDone: () => void; inline?: boolean; start?: number }) {
  const t = useTranslations("fresco");
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(Math.min(start, drops.length - 1));
  const [cards, setCards] = useState<OpenedCardView[] | null>(null);
  const drop = drops[index];
  const last = index >= drops.length - 1;

  useEffect(() => {
    if (!inline) dialog.current?.showModal();
  }, [inline]);

  const next = () => (last ? onDone() : setIndex((i) => i + 1));
  const body = (
    <LazyMotion features={domAnimation} strict>
      <div key={index} className="flex w-full max-w-md flex-col items-center gap-5">
        {drops.length > 1 && <p className="text-xs text-text-muted tabular-nums">{t("counter", { current: index + 1, total: drops.length })}</p>}
        <FragmentCard drop={drop} onCards={inline ? undefined : setCards} />
        <Button type="button" variant="primary" onClick={next} autoFocus>
          {last ? t("continue") : t("next")}
        </Button>
      </div>
      {cards && <CardReveal cards={cards} onClose={() => setCards(null)} />}
    </LazyMotion>
  );
  if (inline) return <div className="flex w-full justify-center rounded-card bg-bg p-4">{body}</div>;
  return (
    <dialog
      ref={dialog}
      aria-label={t("fragment")}
      onCancel={(e) => {
        e.preventDefault();
        onDone();
      }}
      className="m-auto max-h-[100dvh] w-full max-w-lg overflow-y-auto bg-transparent p-4 text-text backdrop:bg-bg/90"
    >
      <div className="flex justify-center rounded-card border border-border bg-surface p-5">{body}</div>
    </dialog>
  );
}
