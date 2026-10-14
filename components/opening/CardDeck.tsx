"use client";

import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { Fuda } from "../fuda/Fuda";
import { CardBack } from "../fuda/CardBack";
import { Button } from "../ui/Button";
import { CHARGE_MS } from "./RarityFx";
import { FlipCard, type FlipPhase } from "./RevealCard";
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
 * Toutes les fuda du tirage sont empilées face cachée. Un geste retourne celle du dessus ;
 * le suivant la retire du tas, puis la prochaine devient manipulable après sa sortie.
 */
export function CardDeck({ cards, reduced, play, onMythic, onDone }: Props) {
  const t = useTranslations("opening");
  const [order] = useState(() => revealOrder(cards));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<FlipPhase>("back");
  const [topVisible, setTopVisible] = useState(true);
  const phaseRef = useRef<FlipPhase>("back");
  const advancing = useRef(false);
  const finished = useRef(false);
  const focusNext = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un glissement se termine par un clic : on ne compte pas l'action deux fois
  const dragged = useRef(false);
  const done = index >= order.length;
  const current = order[index];

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (dragReset.current) clearTimeout(dragReset.current);
  }, []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (dragReset.current) clearTimeout(dragReset.current);
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (done) finish();
  }, [done, finish]);

  const focusTop = useCallback((node: HTMLButtonElement | null) => {
    if (node && focusNext.current) {
      node.focus({ preventScroll: true });
      focusNext.current = false;
    }
  }, []);

  const advance = () => {
    if (!advancing.current || finished.current) return;
    phaseRef.current = "back";
    advancing.current = false;
    focusNext.current = true;
    dragged.current = false;
    setPhase("back");
    setIndex((i) => i + 1);
    setTopVisible(true);
  };

  const flip = () => {
    if (!current || phaseRef.current !== "back" || advancing.current || finished.current) return;
    const charge = reduced ? 0 : CHARGE_MS[current.rarity];
    if (current.rarity === "MYTHIC" && !reduced) {
      onMythic();
      play("taiko", [80]);
    }
    if (charge === 0) {
      phaseRef.current = "front";
      setPhase("front");
      for (const [s, h] of revealFx(current.rarity)) play(s, h);
      return;
    }
    phaseRef.current = "charging";
    setPhase("charging");
    timer.current = setTimeout(() => {
      timer.current = null;
      if (finished.current) return;
      phaseRef.current = "front";
      setPhase("front");
      for (const [s, h] of revealFx(current.rarity)) play(s, h);
    }, charge);
  };

  const next = () => {
    if (phaseRef.current !== "front" || advancing.current || finished.current) return;
    advancing.current = true;
    play("whoosh");
    setTopVisible(false);
  };

  // Balayage (glisser la carte) ou simple appui : même action
  const act = () => (phaseRef.current === "back" ? flip() : phaseRef.current === "front" ? next() : undefined);
  const remaining = order.length - index - 1;
  const last = index === order.length - 1;
  const interactive = topVisible && phase !== "charging";
  const discovered = index + (phase === "front" ? 1 : 0);
  const slotColumns = Math.min(5, order.length);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-sm text-text-muted" aria-live="polite">
        {done ? t("deckDone") : t("deckProgress", { current: index + 1, total: order.length })}
      </p>

      <div className="card-deck-stack relative isolate mb-6 aspect-[5/7] w-[min(15rem,62vw)]">
        {/* Un dos par carte restante ; l'épaisseur totale reste contenue pour les gros tirages. */}
        {order.slice(index + 1).map((card, i) => {
          const depth = i + 1;
          const offset = depth * Math.min(3, 20 / Math.max(1, remaining));
          const rotate = ((depth % 3) - 1) * Math.min(1.8, 0.35 + depth * 0.08);
          return <m.div
            key={card.userCardId}
            aria-hidden="true"
            className="card-deck-layer pointer-events-none absolute inset-0"
            style={{ zIndex: remaining - i }}
            initial={false}
            animate={{ x: offset * 0.55, y: offset, rotate }}
            transition={{ duration: reduced ? 0 : 0.25 }}
          >
            <CardBack static />
          </m.div>;
        })}

        <AnimatePresence mode="wait" initial={false} onExitComplete={advance}>
          {current && topVisible && (
            <m.button
              key={current.userCardId}
              ref={focusTop}
              type="button"
              aria-disabled={!interactive}
              onClick={() => {
                if (dragged.current) dragged.current = false;
                else act();
              }}
              drag={!reduced && interactive}
              dragSnapToOrigin
              dragElastic={0.5}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={(_, info) => {
                if (Math.hypot(info.offset.x, info.offset.y) > 60) act();
                // Le clic qui suit éventuellement le glissement est ignoré, puis on réarme
                if (dragReset.current) clearTimeout(dragReset.current);
                dragReset.current = setTimeout(() => {
                  dragged.current = false;
                  dragReset.current = null;
                }, 0);
              }}
              aria-label={phase === "front" ? t(last ? "toRecap" : "nextCard") : t("revealCard")}
              className="card-deck-top absolute inset-0 block w-full touch-none text-base outline-offset-8 aria-disabled:cursor-default"
              style={{ zIndex: order.length + 1 }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
              exit={reduced
                ? { opacity: 0, transition: { duration: 0.12 } }
                : { opacity: 0, x: 170, y: 50, rotate: 16, scale: 0.8, transition: { duration: 0.32 } }}
              transition={{ duration: reduced ? 0.12 : 0.2 }}
            >
              <FlipCard card={current} phase={phase} size="lg" reduced={reduced} />
            </m.button>
          )}
        </AnimatePresence>
      </div>

      <p className="h-5 text-center text-xs text-text-muted">
        {!done && topVisible && (phase === "back" ? t("deckHint") : phase === "front" ? t(last ? "deckLastHint" : "deckNextHint") : "")}
      </p>

      {/* Tous les emplacements existent dès le début, y compris pour plusieurs boosters. */}
      {order.length > 0 && <ul
        className="card-deck-slots grid max-h-80 w-full gap-2 overflow-y-auto"
        style={{ gridTemplateColumns: `repeat(${slotColumns}, minmax(0, 1fr))`, maxWidth: slotColumns * 72 + (slotColumns - 1) * 8 }}
        aria-label={t("revealSlots")}
      >
        {order.map((card, i) => (
          <li key={card.userCardId} className="card-deck-slot relative aspect-[5/7] min-w-0" data-discovered={i < discovered}>
            {i < discovered ? (
              <m.div className="absolute inset-0" initial={reduced ? false : { opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}>
                <Fuda card={card} series={card.series} size="sm" />
              </m.div>
            ) : (
              <div className="card-deck-empty flex h-full items-center justify-center rounded-[5px] border border-dashed border-kin/25 bg-[radial-gradient(ellipse_at_center,rgb(217_181_86/0.04),transparent_75%)]">
                <span aria-hidden="true" className="font-title text-3xl text-kin/50 [text-shadow:0_0_10px_rgb(217_181_86/0.15)]">?</span>
                <span className="sr-only">{t("unrevealedSlot", { position: i + 1, total: order.length })}</span>
              </div>
            )}
          </li>
        ))}
      </ul>}

      {!done && (
        <Button onClick={finish} className="min-w-40">
          {t("revealAll")}
        </Button>
      )}
    </div>
  );
}
