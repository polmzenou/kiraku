"use client";
import { useRarities, useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { fxTier, isBigMoment, isTopTier } from "@/lib/catalog/tiers";
import { AnimatePresence, m } from "motion/react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { fitSlotGrid, type SlotGrid } from "@/lib/boosters/slot-grid";
import type { OpenedCardView } from "@/lib/boosters/view";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { Fuda } from "../fuda/Fuda";
import { CardBack } from "../fuda/CardBack";
import { Button } from "../ui/Button";
import { Aurora } from "./Aurora";
import { chargeFor, leakFor } from "./RarityFx";
import { FlipCard, type FlipPhase } from "./RevealCard";
import { RevealTitle, titleGone, useMomentFor, type Moment } from "./RevealMoment";
import type { SoundName } from "@/lib/sound/synth";

/** Ordre de révélation : de la moins rare à la plus rare (une vedette après les autres de sa rareté). */
export function revealOrder<T extends { rarity: Rarity; featured?: boolean }>(cards: readonly T[], order: readonly string[] = RARITIES): T[] {
  const RARITIES = order;
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

/**
 * Passage rapide : index de la première carte « grand moment » (Légendaire ou mieux) à partir de `from`,
 * s'il reste au moins `min` cartes à sauter avant elle ; -1 sinon. L'ordre de révélation allant de la moins
 * rare à la plus rare, c'est la Légendaire, ou la Mythique d'un pack qui n'a pas de Légendaire.
 */
export function skipTarget<T extends { rarity: Rarity }>(order: readonly T[], from: number, isBig: (rarity: Rarity) => boolean, min = SKIP_MIN): number {
  const at = order.findIndex((card, i) => i >= from && isBig(card.rarity));
  return at >= 0 && at - from >= min ? at : -1;
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

/** Boîte de départ de la pile, relative à `origin`. */
export type DeckFrom = { x: number; y: number; width: number; height: number };

/** Arrivée de la pile : la carte du dessus mène, chaque carte suit la précédente avec un léger retard. */
const ARRIVE = { type: "spring", visualDuration: 0.55, bounce: 0.16 } as const;
const ARRIVE_STAGGER = 0.05;
const ARRIVE_MAX_DELAY = 0.4;
/**
 * Dos visibles sous la carte du dessus et décalage entre deux dos (px) : la pile a la même allure
 * pour un booster ou pour dix, les cartes suivantes attendent au fond sans être dessinées.
 */
const VISIBLE_BACKS = 4;
const STEP_PX = 3;

/** Passage rapide vers la première Légendaire ou mieux : proposé s'il reste au moins autant de cartes avant elle. */
const SKIP_MIN = 3;

/** Emplacements sous la pile : écart (px, `gap-2`) et largeur max sur desktop. */
const SLOT_GAP = 8;
const SLOT_MAX_DESKTOP = 88;
/** Sous la grille : écart (`gap-5`) avant « Tout révéler » et marge en bas de l'écran (px). */
const SLOTS_BOTTOM = 20 + 16;

/** Haut de l'élément dans la page, sans les `transform` des animations d'entrée. */
function pageTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

/**
 * Desktop : la grille s'étale sur toute la largeur et tient entre son haut et le bas de l'écran,
 * « Tout révéler » compris, sans barre de défilement. Mobile : null (5 colonnes qui défilent).
 */
function useDesktopSlotGrid(slots: RefObject<HTMLUListElement | null>, below: RefObject<HTMLDivElement | null>, count: number) {
  const [grid, setGrid] = useState<SlotGrid | null>(null);
  useLayoutEffect(() => {
    const ul = slots.current;
    const box = ul?.parentElement;
    if (!ul || !box || count === 0) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      if (!desktop.matches) return setGrid(null);
      const height = window.innerHeight - pageTop(ul) - (below.current?.offsetHeight ?? 0) - SLOTS_BOTTOM;
      setGrid(fitSlotGrid({ count, width: box.clientWidth, height, gap: SLOT_GAP, maxWidth: SLOT_MAX_DESKTOP, ratio: 7 / 5 }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    window.addEventListener("resize", measure);
    desktop.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      desktop.removeEventListener("change", measure);
    };
  }, [slots, below, count]);
  return grid;
}

type Props = {
  cards: OpenedCardView[];
  /** Les cartes sortent du booster : la pile part de cette boîte (mesurée dans `origin`) pour rejoindre sa place. */
  from?: DeckFrom | null;
  origin?: RefObject<HTMLElement | null>;
  reduced: boolean;
  /** Effets allégés (appareil qui rame ou réglage) : moins de particules autour des cartes. */
  lite?: boolean;
  play: (name: SoundName, haptic?: number | number[]) => void;
  /** Une Mythique va sortir : la scène s'assombrit et tremble. */
  onMythic: () => void;
  /** Carte à l'endroit qui a droit au grand moment (Légendaire et au-delà), ou null. */
  onMoment: (moment: Pick<Moment, "id" | "rarity"> | null) => void;
  onDone: () => void;
};

/**
 * Toutes les fuda du tirage sont empilées face cachée. Un geste retourne celle du dessus ;
 * le suivant la retire du tas, puis la prochaine devient manipulable après sa sortie.
 */
export function CardDeck({ cards, from, origin, reduced, lite = false, play, onMythic, onMoment, onDone }: Props) {
  const t = useTranslations("opening");
  const tRarity = useTranslations("rarity");
  const rarities = useRarities();
  const definitions = useRarityDefinitions();
  const [order] = useState(() => revealOrder(cards, rarities));
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
  const momentFor = useMomentFor();
  const moment = current && phase === "front" && topVisible ? momentFor(current.userCardId, current.rarity) : null;
  const momentId = moment?.id ?? null;
  const momentRarity = moment?.rarity ?? null;
  const stack = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLUListElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const slotGrid = useDesktopSlotGrid(slotsRef, belowRef, order.length);
  // Arrivée depuis le booster : décalage de départ de la pile, mesuré avant le premier affichage
  const [arrival] = useState(() => Boolean(from) && !reduced);
  const [intro, setIntro] = useState<{ x: number; y: number; scale: number } | "measure" | null>(arrival ? "measure" : null);
  const start = intro !== null && intro !== "measure" ? intro : null;
  // Tant que la première carte n'est pas partie, rien d'autre ne fait bouger la pile
  const arriving = start !== null && index === 0;

  useLayoutEffect(() => {
    if (intro !== "measure") return;
    const box = stack.current?.getBoundingClientRect();
    const base = origin?.current?.getBoundingClientRect();
    if (!box || !base || !from) {
      setIntro(null);
      return;
    }
    setIntro({
      x: from.x + from.width / 2 - (box.left - base.left + box.width / 2),
      y: from.y + from.height / 2 - (box.top - base.top + box.height / 2),
      scale: from.width / box.width,
    });
  }, [intro, from, origin]);

  // Le reste de l'écran (compteur, aide, emplacements) se pose une fois la pile arrivée
  const appear = (delay: number) =>
    arrival ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay } } : {};

  // Le fond et l'entrée plein écran vivent dans OpeningStage : on lui signale chaque changement
  useEffect(() => {
    onMoment(momentId && momentRarity ? { id: momentId, rarity: momentRarity } : null);
  }, [momentId, momentRarity, onMoment]);
  useEffect(() => () => onMoment(null), [onMoment]);

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
    const charge = reduced ? 0 : (chargeFor(current.rarity, definitions) ?? 480);
    const tier = fxTier(current.rarity, definitions);
    if (tier === "MYTHIC" && !reduced) {
      onMythic();
      play("taiko", [80]);
    }
    if (charge === 0) {
      phaseRef.current = "front";
      setPhase("front");
      for (const [s, h] of revealFx(tier)) play(s, h);
      return;
    }
    phaseRef.current = "charging";
    setPhase("charging");
    timer.current = setTimeout(() => {
      timer.current = null;
      if (finished.current) return;
      phaseRef.current = "front";
      setPhase("front");
      for (const [s, h] of revealFx(tier)) play(s, h);
    }, charge);
  };

  const next = () => {
    if (phaseRef.current !== "front" || advancing.current || finished.current) return;
    advancing.current = true;
    play("whoosh");
    setTopVisible(false);
  };

  // Passage rapide : droit à la première carte Légendaire ou mieux (la Mythique d'un pack sans
  // Légendaire), les cartes d'avant comptent comme découvertes ; seulement s'il y a de quoi sauter
  const bigAt = skipTarget(order, index, (rarity) => isBigMoment(rarity, definitions));
  const canSkip = bigAt >= 0;
  const skipToBig = () => {
    if (!canSkip || finished.current) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    phaseRef.current = "back";
    advancing.current = false;
    focusNext.current = true;
    dragged.current = false;
    play("whoosh");
    setPhase("back");
    setIndex(bigAt);
    setTopVisible(true);
  };

  // Balayage (glisser la carte) ou simple appui : même action
  const act = () => (phaseRef.current === "back" ? flip() : phaseRef.current === "front" ? next() : undefined);
  const last = index === order.length - 1;
  const interactive = topVisible && phase !== "charging";
  const discovered = index + (phase === "front" ? 1 : 0);
  const slotColumns = slotGrid?.columns ?? Math.min(5, order.length);
  const backs = order.slice(index + 1, index + 1 + VISIBLE_BACKS);
  // Aurore tant qu'une Mythique, AR ou Gold reste dans la pile (retournée comprise)
  const topTier = order.slice(index).filter((card) => isTopTier(card.rarity, definitions));
  const best = topTier.at(-1);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      {/* Le nom d'une grande rareté prend un moment la place du compteur, au-dessus de la carte */}
      <m.div className="relative z-10 flex min-h-14 w-full flex-col items-center justify-end" {...appear(0.3)}>
        <p
          key={moment?.id ?? "progress"}
          className={`text-sm text-text-muted ${moment ? "moment-return" : ""}`}
          style={moment ? ({ "--d": `${titleGone(moment.name)}s` } as CSSProperties) : undefined}
          aria-live="polite"
        >
          {done ? t("deckDone") : t("deckProgress", { current: index + 1, total: order.length })}
        </p>
        {moment && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <RevealTitle key={moment.id} moment={moment} />
          </div>
        )}
      </m.div>

      <div ref={stack} className="card-deck-stack relative isolate mb-6 aspect-[5/7] w-[min(15rem,62vw)] lg:mb-4 lg:w-[min(15rem,25svh)]">
        <AnimatePresence>
          {intro !== "measure" && best && (
            <Aurora
              key="aurora"
              accent={leakFor(best.rarity, definitions)}
              near={current !== undefined && isTopTier(current.rarity, definitions)}
              lite={lite}
              reduced={reduced}
              delay={arrival ? 0.6 : 0.2}
            />
          )}
        </AnimatePresence>
        {/* Quelques dos sous la carte du dessus, comme pour un seul booster : quand la pile bouge,
            chaque carte suit celle de devant avec un léger retard. Un dos qui entre au fond après
            l'arrivée apparaît à sa place (il ne repart pas de la position du booster). */}
        {intro !== "measure" && backs.map((card, i) => {
          const depth = i + 1;
          const offset = depth * STEP_PX;
          const rotate = ((depth % 3) - 1) * Math.min(1.8, 0.35 + depth * 0.08);
          return <m.div
            key={card.userCardId}
            aria-hidden="true"
            className="card-deck-layer pointer-events-none absolute inset-0"
            style={{ zIndex: VISIBLE_BACKS + 1 - i }}
            initial={
              start && arriving
                ? { x: start.x, y: start.y, scale: start.scale, rotate: 0 }
                : index === 0 || reduced
                  ? false
                  : { x: offset * 0.55, y: offset, rotate, scale: 1, opacity: 0 }
            }
            animate={{ x: offset * 0.55, y: offset, rotate, scale: 1, opacity: 1 }}
            transition={
              reduced
                ? { duration: 0 }
                : arriving
                  ? { ...ARRIVE, delay: Math.min(depth * ARRIVE_STAGGER, ARRIVE_MAX_DELAY) }
                  : { duration: 0.25, delay: Math.min(i, 6) * 0.03 }
            }
          >
            {/* Toujours le dos classique : seule la carte du dessus montre son dos premium */}
            <CardBack flat />
          </m.div>;
        })}

        {intro !== "measure" && <m.div
          className="absolute inset-0"
          style={{ zIndex: order.length + 1 }}
          initial={start ? { x: start.x, y: start.y, scale: start.scale } : false}
          animate={{ x: 0, y: 0, scale: 1 }}
          transition={ARRIVE}
        >
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
                // Elle prend la place exacte de son dos dans la pile, sans transparence (on ne voit jamais
                // la carte d'en dessous) ; une Mythique, AR ou Gold dévoile son dos premium en fondu.
                initial={
                  index > 0 && !isTopTier(current.rarity, definitions)
                    ? { opacity: 1, x: STEP_PX * 0.55, y: STEP_PX }
                    : reduced
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.98 }
                }
                animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                exit={reduced
                  ? { opacity: 0, transition: { duration: 0.12 } }
                  : { opacity: 0, x: 170, y: 50, rotate: 16, scale: 0.8, transition: { duration: 0.32 } }}
                transition={{ duration: reduced ? 0.12 : 0.2 }}
              >
                <FlipCard card={current} phase={phase} size="lg" reduced={reduced} compactFx={lite} />
              </m.button>
            )}
          </AnimatePresence>
        </m.div>}
      </div>

      <m.p className="h-5 text-center text-xs text-text-muted" {...appear(0.45)}>
        {!done && topVisible && (phase === "back" ? t("deckHint") : phase === "front" ? t(last ? "deckLastHint" : "deckNextHint") : "")}
      </m.p>

      {/* Tous les emplacements existent dès le début, y compris pour plusieurs boosters. */}
      {order.length > 0 && <m.ul
        ref={slotsRef}
        // Lignes centrées : la dernière, incomplète, se cale au milieu sous les autres
        className={`card-deck-slots flex w-full flex-wrap justify-center gap-2 ${slotGrid ? "" : "max-h-80 overflow-y-auto"}`}
        style={{
          "--slot-w": `calc((100% - ${(slotColumns - 1) * SLOT_GAP}px) / ${slotColumns})`,
          maxWidth: slotColumns * (slotGrid?.slotWidth ?? 72) + (slotColumns - 1) * SLOT_GAP,
        } as CSSProperties}
        aria-label={t("revealSlots")}
        {...appear(0.5)}
      >
        {order.map((card, i) => (
          <DeckSlot key={card.userCardId} card={card} discovered={i < discovered} reduced={reduced} label={t("unrevealedSlot", { position: i + 1, total: order.length })} />
        ))}
      </m.ul>}

      {!done && (
        <m.div ref={belowRef} className="flex flex-wrap justify-center gap-2" {...appear(0.55)}>
          {canSkip && (
            <Button variant="primary" onClick={skipToBig} className="min-w-40">
              {t("skipToBig", { rarity: tRarity(order[bigAt].rarity) })}
            </Button>
          )}
          <Button onClick={finish} className="min-w-40">
            {t("revealAll")}
          </Button>
        </m.div>
      )}
    </div>
  );
}

/**
 * Emplacement du récapitulatif sous la pile : mémoïsé et figé, il ne se redessine que lorsque sa
 * carte est découverte (pas à chaque geste ni à chaque changement de la scène).
 */
const DeckSlot = memo(function DeckSlot({ card, discovered, reduced, label }: { card: OpenedCardView; discovered: boolean; reduced: boolean; label: string }) {
  return (
    <li className="card-deck-slot @container relative aspect-[5/7] w-(--slot-w) min-w-0" data-discovered={discovered}>
      {discovered ? (
        <m.div className="absolute inset-0" initial={reduced ? false : { opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}>
          <Fuda card={card} series={card.series} size="sm" still />
        </m.div>
      ) : (
        <div className="card-deck-empty flex h-full items-center justify-center rounded-[5px] border border-dashed border-kin/25 bg-[radial-gradient(ellipse_at_center,rgb(217_181_86/0.04),transparent_75%)]">
          <span aria-hidden="true" className="font-title text-[clamp(0.625rem,50cqw,1.875rem)] text-kin/50 [text-shadow:0_0_10px_rgb(217_181_86/0.15)]">?</span>
          <span className="sr-only">{label}</span>
        </div>
      )}
    </li>
  );
});
