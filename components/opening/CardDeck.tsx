"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { Fuda } from "../fuda/Fuda";
import { Button } from "../ui/Button";
import { CHARGE_MS } from "./RarityFx";
import { CardBack, FlipCard, type FlipPhase } from "./RevealCard";
import type { SoundName } from "@/lib/sound/synth";

/** Ordre de révélation : de la moins rare à la plus rare (une vedette après les autres de sa rareté). */
export function revealOrder<T extends { rarity: Rarity; featured?: boolean }>(cards: readonly T[]): T[] {
  return cards
    .map((card, i) => ({ card, i }))
    .sort(
      (a, b) =>
        RARITIES.indexOf(a.card.rarity) - RARITIES.indexOf(b.card.rarity) ||
        Number(a.card.featured ?? false) - Number(b.card.featured ?? false) ||
        a.i - b.i,
    )
    .map((x) => x.card);
}

/** Son et vibration du retournement d'une carte de cette rareté. */
export function revealFx(rarity: Rarity): [SoundName, number | number[] | undefined][] {
  switch (rarity) {
    case "RARE":
      return [["flip", undefined], ["bell", 20]];
    case "EPIC":
      return [["flip", undefined], ["bell", 35]];
    case "LEGENDARY":
      return [["flip", undefined], ["chime", [30, 40, 30]]];
    case "MYTHIC":
      return [["stamp", undefined], ["chime", [60, 50, 120]]];
    default:
      return [["flip", undefined]];
  }
}

type Props = {
  cards: OpenedCardView[];
  reduced: boolean;
  play: (name: SoundName, haptic?: number | number[]) => void;
  /** Une Mythique va sortir : la scène s'assombrit et tremble. */
  onMythic: () => void;
  onDone: () => void;
};

/**
 * La pile de fuda d'un booster : on balaie ou on tape pour tirer la carte du dessus, qui se
 * retourne au centre avec la mise en scène de sa rareté, puis rejoint la rangée du bas.
 */
export function CardDeck({ cards, reduced, play, onMythic, onDone }: Props) {
  const t = useTranslations("opening");
  const [order] = useState(() => revealOrder(cards));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<FlipPhase>("back");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un glissement se termine par un clic : on ne compte pas l'action deux fois
  const dragged = useRef(false);
  const done = index >= order.length;
  const current = order[index];

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);

  const flip = () => {
    if (!current || phase !== "back") return;
    const charge = reduced ? 0 : CHARGE_MS[current.rarity];
    if (current.rarity === "MYTHIC") {
      onMythic();
      play("taiko", [80]);
    }
    if (charge === 0) {
      setPhase("front");
      for (const [s, h] of revealFx(current.rarity)) play(s, h);
      return;
    }
    setPhase("charging");
    timer.current = setTimeout(() => {
      setPhase("front");
      for (const [s, h] of revealFx(current.rarity)) play(s, h);
    }, charge);
  };

  const next = () => {
    if (phase !== "front") return;
    play("whoosh");
    setPhase("back");
    setIndex((i) => i + 1);
  };

  // Balayage (glisser la carte) ou simple appui : même action
  const act = () => (phase === "back" ? flip() : phase === "front" ? next() : undefined);
  const remaining = order.length - index - 1;

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-sm text-text-muted" aria-live="polite">
        {done ? t("deckDone") : t("deckProgress", { current: index + 1, total: order.length })}
      </p>

      <div className="relative w-[min(15rem,62vw)]">
        {/* Cartes restantes, en pile derrière */}
        {Array.from({ length: Math.min(Math.max(remaining, 0), 3) }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="absolute inset-0 [transform-style:preserve-3d]"
            style={{ transform: `translate(${(i + 1) * 5}px, ${(i + 1) * 4}px) rotate(${(i + 1) * 1.6}deg) rotateY(180deg)` }}
          >
            <div className="relative aspect-[5/7] w-full text-base">
              <CardBack />
            </div>
          </div>
        ))}

        <AnimatePresence mode="popLayout" initial={false}>
          {current && (
            <m.button
              key={current.userCardId}
              type="button"
              onClick={() => {
                if (dragged.current) dragged.current = false;
                else act();
              }}
              drag={!reduced}
              dragSnapToOrigin
              dragElastic={0.5}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={(_, info) => {
                if (Math.hypot(info.offset.x, info.offset.y) > 60) act();
                // Le clic qui suit éventuellement le glissement est ignoré, puis on réarme
                setTimeout(() => {
                  dragged.current = false;
                }, 0);
              }}
              aria-label={phase === "front" ? t("nextCard") : t("revealCard")}
              className="relative block w-full touch-none text-base outline-offset-8"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 160, scale: 0.35, rotate: -6 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <FlipCard card={current} phase={phase} size="lg" reduced={reduced} />
            </m.button>
          )}
        </AnimatePresence>
      </div>

      <p className="h-5 text-center text-xs text-text-muted">
        {!done && (phase === "back" ? t("deckHint") : phase === "front" ? t("deckNextHint") : "")}
      </p>

      {/* Rangée des cartes déjà révélées */}
      <ul
        className="grid w-full max-w-sm gap-2"
        style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))` }}
        aria-label={t("revealed")}
      >
        {order.map((card, i) => (
          <li key={card.userCardId} className="relative">
            {i < index ? (
              <m.div initial={reduced ? false : { opacity: 0, y: -30, scale: 1.3 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
                <Fuda card={card} series={card.series} size="sm" />
              </m.div>
            ) : (
              <div aria-hidden="true" className="aspect-[5/7] w-full rounded-[5px] border border-dashed border-border" />
            )}
          </li>
        ))}
      </ul>

      {!done && (
        <Button onClick={onDone} className="min-w-40">
          {t("revealAll")}
        </Button>
      )}
    </div>
  );
}
