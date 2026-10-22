"use client";

import { animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type Ref } from "react";
import type { BoosterShape, BoosterTheme } from "@/lib/boosters/types";
import { openingGestureProgress, startOpeningGesture, type OpeningGesture } from "@/lib/boosters/opening-gesture";
import { belowClip, pieceTorn, tearLine, tornRange, type TearPoint } from "@/lib/boosters/tear-line";
import type { Rarity } from "@/lib/catalog/rarity";
import { BoosterArt, JUBAKO_CORD, JUBAKO_LID, POCHI_BODY } from "../boosters/BoosterArt";
import { CardBack } from "../fuda/CardBack";
import { leakFor } from "./RarityFx";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";

/** Part du geste à partir de laquelle l'ouverture est envoyée au serveur. */
const TRIGGER_AT = 0.55;
/**
 * Ligne de déchirure du sachet : la bande se découpe en autant de morceaux que de pas (chaque morceau
 * redessine la bande entière, découpée). Effets allégés : deux fois moins de morceaux.
 */
const TEAR = { full: tearLine(18), lite: tearLine(8) };
const TEAR_BELOW = { full: belowClip(TEAR.full), lite: belowClip(TEAR.lite) };
/** Durée de la déchirure jouée au bouton (le geste, lui, suit le doigt). */
const AUTO_TEAR = 0.38;
/** Envol de la bande arrachée (s) : elle saute, puis retombe en tournoyant hors du sachet. */
const BAND_FLIGHT = 1.15;
const BAND_REST = { x: "0%", y: "0%", rotate: 0, scale: 1, opacity: 1 };
/** Dos de cartes qui sortent par l'ouverture, quel que soit le tirage. */
const PEEK_MAX = 5;
/** Montée d'une carte hors du booster, et décalage entre deux cartes (s). */
const PEEK_RISE = 0.55;
const PEEK_STAGGER = 0.07;
/** Chute du booster vidé, qui découvre les cartes (s). */
const PACK_DROP = 0.6;

export type SceneHandle = {
  open: () => void;
  /** Position à l'écran de la carte du dessus sortie du booster (point de départ de la pile). */
  cards: () => DOMRect | null;
};

type Props = {
  shape: BoosterShape;
  theme: BoosterTheme;
  emblem: string;
  name: string;
  openLabel: string;
  tagline: string;
  contents: string;
  /** Sachets ouverts d'un coup (pile derrière quand > 1). */
  count: number;
  /** Le geste est possible (stock ou paiement confirmé). */
  armed: boolean;
  reduced: boolean;
  /** Effets allégés (appareil qui rame ou réglage). */
  lite?: boolean;
  /** Meilleure rareté du tirage, dès que le serveur a répondu : couleur de la lumière qui s'échappe. */
  leak: Rarity | null;
  /** Le serveur a décidé d'un sachet divin : la nacre se révèle pendant l'ouverture (le doré a ses particules, dans la scène). */
  divine: boolean;
  /** Cartes du tirage, dès que le serveur a répondu (0 avant) : leurs dos sortent par l'ouverture. */
  cards: number;
  /** Appelé une fois, une fois la coupe engagée (ou au clic). */
  onTrigger: () => void;
  /**
   * L'ouverture est finie : bande envolée (rabat ouvert, couvercle levé), cartes sorties et booster
   * tombé. En mouvement réduit, dès la fin de l'ouverture.
   */
  onOpened: () => void;
  onTearSound: () => void;
  /** Le parent déclenche l'ouverture au bouton. */
  openRef?: (handle: SceneHandle) => void;
};

/**
 * Le booster présenté seul au centre de la scène : il flotte, suit l'inclinaison du téléphone (ou
 * la souris) et s'ouvre d'un geste. Sachet : on déchire la bande du haut d'un glissement horizontal
 * (au bouton, la même déchirure se joue seule) ;
 * pochibukuro et jūbako : on glisse vers le haut pour soulever le rabat ou le couvercle.
 */
export function BoosterScene(props: Props) {
  const { shape, theme, emblem, name, tagline, contents, count, armed, reduced, leak, divine, cards, lite = false } = props;
  const definitions = useRarityDefinitions();
  const progress = useMotionValue(0);
  const [opened, setOpened] = useState(false);
  const [flown, setFlown] = useState(false);
  const [dropped, setDropped] = useState(false);
  const front = useRef<HTMLDivElement>(null);
  const handedOff = useRef(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const fired = useRef(false);
  const completing = useRef(false);
  const finished = useRef(false);
  const suppressClick = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animation = useRef<{ stop: () => void } | null>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const drag = useRef<(OpeningGesture & { id: number }) | null>(null);
  const { onTrigger, onOpened, onTearSound, openRef } = props;
  const onOpenedRef = useRef(onOpened);
  useEffect(() => { onOpenedRef.current = onOpened; }, [onOpened]);

  useTilt(tilt, !reduced && !opened);

  useEffect(() => () => {
    if (fallback.current) clearTimeout(fallback.current);
    animation.current?.stop();
  }, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    setFlown(true);
  };

  // Booster ouvert et tirage connu : les cartes montent par l'ouverture, puis le booster tombe et les
  // découvre. Minuteries plutôt que fins d'animation : un onglet en arrière-plan ne bloque rien.
  const shown = Math.min(cards, PEEK_MAX);
  const emerging = flown && !reduced && shown > 0;
  useEffect(() => {
    if (!flown) return;
    const handOff = () => {
      if (handedOff.current) return;
      handedOff.current = true;
      onOpenedRef.current();
    };
    if (reduced) {
      handOff();
      return;
    }
    if (shown === 0) return;
    const rise = (PEEK_RISE + (shown - 1) * PEEK_STAGGER) * 1000;
    const drop = setTimeout(() => setDropped(true), rise);
    const end = setTimeout(handOff, rise + (PACK_DROP + (shown - 1) * PEEK_STAGGER * 0.6) * 1000);
    return () => {
      clearTimeout(drop);
      clearTimeout(end);
    };
  }, [flown, reduced, shown]);

  const fire = () => {
    if (fired.current || !armed) return;
    fired.current = true;
    onTrigger();
  };

  const complete = () => {
    // Le serveur désarme la scène dès le déclenchement ; le geste en cours doit pouvoir finir.
    if (completing.current || (!armed && !fired.current)) return;
    completing.current = true;
    fire();
    onTearSound();
    if (reduced) {
      progress.set(1);
      setOpened(true);
      finish();
      return;
    }
    animation.current?.stop();
    // Au bouton, la déchirure se joue seule de gauche à droite ; après un geste, elle finit vite.
    const auto = progress.get() < 0.05;
    if (auto) setDirection(1);
    const opening = animate(progress, 1, auto ? { duration: AUTO_TEAR, ease: "easeOut" } : { duration: 0.15, ease: "easeOut" });
    animation.current = opening;
    opening.then(() => setOpened(true));
    // Filet de sécurité : si l'onglet ne dessine plus (arrière-plan), l'ouverture ne reste pas bloquée
    fallback.current = setTimeout(() => {
      setOpened(true);
      finish();
    }, (AUTO_TEAR + BAND_FLIGHT) * 1000 + 400);
  };

  useEffect(() => {
    openRef?.({ open: complete, cards: () => front.current?.getBoundingClientRect() ?? null });
  });

  const vertical = shape !== "SACHET";
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!armed || completing.current || drag.current || !e.isPrimary || e.button !== 0) return;
    animation.current?.stop();
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const started = startOpeningGesture(e.clientX, e.clientY, r, vertical);
    drag.current = { ...started, id: e.pointerId };
    setDirection(started.direction);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || completing.current) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) suppressClick.current = true;
    const p = openingGestureProgress(d, e.clientX, e.clientY);
    if (p > progress.get()) progress.set(p);
    if (p >= TRIGGER_AT) fire();
    if (p >= 1) complete();
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (e.type === "pointerup") onPointerMove(e);
    if (e.type !== "pointerup" || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) suppressClick.current = true;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // Une fois l'ouverture envoyée, on termine le geste ; sinon tout revient en place
    if (fired.current) complete();
    else animation.current = animate(progress, 0, { duration: reduced ? 0 : 0.25 });
  };
  const gesture = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onLostPointerCapture: onPointerEnd,
  };

  // Seule la meilleure rareté colore la lumière : avant la réponse du serveur, la fente reste blanche
  const leakColor = leak ? leakFor(leak, definitions) ?? null : null;

  const overlay = (
    <>
      {/* Lumière qui s'échappe de l'ouverture ; elle s'éteint quand les cartes la traversent */}
      <m.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-40"
        initial={false}
        animate={{ opacity: emerging ? 0 : 1 }}
        transition={{ duration: 0.5 }}
      >
        <Leak progress={progress} color={leakColor} strong={opened && leakColor !== null} shape={shape} reduced={reduced} />
      </m.span>
      {/* Nacre du sachet divin, révélée pendant l'ouverture */}
      {divine && (
        <m.span
          aria-hidden="true"
          className="fx-nacre pointer-events-none absolute inset-0 z-20 opacity-80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {/* Le rabat ou le couvercle s'efface pour laisser passer les cartes */}
      {shape !== "SACHET" && (
        <m.div className="absolute inset-0 z-30" initial={false} animate={{ opacity: emerging ? 0 : 1 }} transition={{ duration: 0.25 }}>
          {shape === "POCHIBUKURO" ? <PochiFlap progress={progress} gesture={gesture} /> : <JubakoLid progress={progress} gesture={gesture} />}
        </m.div>
      )}
    </>
  );

  return (
    <div
      role="button"
      tabIndex={armed ? 0 : -1}
      aria-label={props.openLabel}
      aria-disabled={!armed}
      className={`relative isolate w-[min(16rem,66vw)] rounded-xl outline-offset-8 [perspective:1000px] ${armed ? "cursor-pointer" : ""}`}
      onPointerDownCapture={(e) => {
        if (e.isPrimary && e.button === 0 && !drag.current) suppressClick.current = false;
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (armed) complete();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && armed) {
          e.preventDefault();
          complete();
        }
      }}
    >
      {!opened && <IdleHalo progress={progress} color={theme.base} reduced={reduced} />}
      {count > 1 && (
        <>
          <m.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 translate-x-4 translate-y-3 rotate-[4deg]"
            initial={false}
            animate={{ opacity: opened ? 0 : 0.45 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <BoosterArt shape={shape} theme={theme} emblem={emblem} name="" contents={contents} compact />
          </m.div>
          <m.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 translate-x-2 translate-y-1.5 rotate-2"
            initial={false}
            animate={{ opacity: opened ? 0 : 0.7 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <BoosterArt shape={shape} theme={theme} emblem={emblem} name="" contents={contents} compact />
          </m.div>
        </>
      )}
      <m.div
        className={reduced || opened ? "" : "booster-idle"}
        animate={opened && !reduced ? { y: [0, 9, -4, 0], scale: [1, 0.97, 1.025, 1] } : undefined}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <div ref={tilt} className="relative [transform-style:preserve-3d]">
          {emerging && <PeekCards count={shown} dropped={dropped} frontRef={front} />}
          {/* Une fois les cartes sorties, le booster vidé tombe et les découvre */}
          <m.div
            className="relative z-10"
            initial={false}
            animate={dropped ? { y: "120%", opacity: 0 } : { y: "0%", opacity: 1 }}
            transition={{ duration: PACK_DROP, ease: [0.55, 0, 0.8, 0.4] }}
          >
            <BoosterArt
              shape={shape}
              theme={theme}
              emblem={emblem}
              name={name}
              tagline={tagline}
              contents={contents}
              hideCover={shape !== "SACHET"}
              overlay={overlay}
              flatShadow
              renderBand={
                shape === "SACHET"
                  ? (band) => (
                      <TearBand
                        band={band}
                        lite={lite}
                        progress={progress}
                        opened={opened}
                        reduced={reduced}
                        direction={direction}
                        armed={armed}
                        gesture={gesture}
                        onFlown={finish}
                      />
                    )
                  : undefined
              }
            />
          </m.div>
        </div>
      </m.div>
      {/* Pochibukuro et jūbako : fin de l'ouverture quand le rabat ou le couvercle est parti */}
      {shape !== "SACHET" && opened && <Done onDone={finish} delay={reduced ? 0 : 800} />}
    </div>
  );
}

/**
 * Dos des cartes du tirage, glissés derrière l'avant du booster : ils montent par l'ouverture l'un
 * après l'autre (celui du fond ouvre la marche, celui du dessus le rattrape), puis redescendent
 * doucement pendant que le booster tombe (celui du dessus mène, les autres suivent).
 */
function PeekCards({ count, dropped, frontRef }: { count: number; dropped: boolean; frontRef: Ref<HTMLDivElement> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-[11%] top-[15%] aspect-[5/7]">
      {Array.from({ length: count }, (_, i) => (
        <m.div
          key={i}
          ref={i === count - 1 ? frontRef : undefined}
          className="absolute inset-0"
          initial={{ y: "0%" }}
          animate={{ y: dropped ? "-12%" : "-32%" }}
          transition={
            dropped
              ? { type: "spring", visualDuration: PACK_DROP, bounce: 0.1, delay: (count - 1 - i) * PEEK_STAGGER * 0.6 }
              : { type: "spring", visualDuration: PEEK_RISE, bounce: 0.18, delay: i * PEEK_STAGGER }
          }
        >
          <CardBack flat />
        </m.div>
      ))}
    </div>
  );
}

function Done({ onDone, delay }: { onDone: () => void; delay: number }) {
  const called = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (called.current) return;
      called.current = true;
      onDone();
    }, delay);
    return () => clearTimeout(id);
  }, [onDone, delay]);
  return null;
}

type Gesture = {
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => void;
};

/**
 * Bande du sachet déchirée comme du washi : la ligne de déchirure est irrégulière, la partie déjà
 * arrachée se soulève en pivotant autour du front de déchirure (un liseré de fibres blanches apparaît
 * dessous), puis toute la bande s'envole. Morceaux à découpe fixe : seuls transform et opacity bougent.
 */
function TearBand(props: {
  band: ReactNode;
  lite: boolean;
  progress: MotionValue<number>;
  opened: boolean;
  reduced: boolean;
  direction: 1 | -1;
  armed: boolean;
  gesture: Gesture;
  onFlown: () => void;
}) {
  const { band, lite, progress, opened, reduced, direction, armed, gesture, onFlown } = props;
  const line = lite ? TEAR.lite : TEAR.full;
  const [flown, setFlown] = useState(false);
  const onFlownRef = useRef(onFlown);
  useEffect(() => { onFlownRef.current = onFlown; }, [onFlown]);
  useEffect(() => {
    if (!opened) return;
    // Retirer la bande après l'envol, même si Motion interrompt un callback.
    const timeout = setTimeout(() => {
      setFlown(true);
      onFlownRef.current();
    }, reduced ? 0 : BAND_FLIGHT * 1000);
    return () => clearTimeout(timeout);
  }, [opened, reduced]);
  // La partie arrachée pivote autour du front de déchirure
  const originX = useTransform(progress, (p) => tornRange(p, direction).front / 100);
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-0 z-30 h-[13%] min-h-11 touch-none ${armed ? "cursor-crosshair" : ""}`}
      {...gesture}
    >
      {/* Reste de bande serti sous la déchirure */}
      <div className="absolute inset-0" style={{ clipPath: lite ? TEAR_BELOW.lite : TEAR_BELOW.full }}>
        {band}
      </div>
      {line.slice(1).map((to, i) => (
        <FiberEdge key={i} from={line[i] ?? to} to={to} progress={progress} direction={direction} />
      ))}
      {!flown && (
        <m.div
          className="absolute inset-0"
          initial={false}
          // Cible de repos explicite : avec `undefined`, Motion ne monte son animation qu'à l'ouverture,
          // la prend pour un premier rendu et `initial={false}` l'annule (la bande disparaissait sans bouger).
          animate={
            opened
              ? reduced
                ? { opacity: 0 }
                : {
                    // Saut vers le côté de la déchirure, puis chute accélérée qui passe sous le sachet
                    x: ["0%", `${direction * 28}%`, `${direction * 70}%`],
                    y: ["0%", "-190%", "900%"],
                    rotate: [0, direction * 28, direction * 230],
                    scale: [1, 1.06, 0.82],
                    opacity: [1, 1, 1, 0],
                  }
              : BAND_REST
          }
          transition={
            reduced
              ? { duration: 0.15 }
              : {
                  duration: BAND_FLIGHT,
                  times: [0, 0.32, 1],
                  ease: ["easeOut", "easeIn"],
                  opacity: { duration: BAND_FLIGHT, times: [0, 0.32, 0.78, 1], ease: "linear" },
                }
          }
        >
          {line.slice(1).map((to, i) => (
            <TearPiece
              key={i}
              from={line[i] ?? to}
              to={to}
              band={band}
              progress={progress}
              direction={direction}
              originX={originX}
              reduced={reduced}
            />
          ))}
        </m.div>
      )}
      {/* Ligne lumineuse qui suit la déchirure */}
      <m.span
        className="pointer-events-none absolute inset-x-[4%] bottom-0 h-[3px] rounded-full bg-washi-paper shadow-[0_0_8px_rgb(255_255_255/0.9)] will-change-transform"
        style={{ scaleX: progress, transformOrigin: direction === 1 ? "left" : "right" }}
      />
      {!reduced && <Fibers progress={progress} direction={direction} />}
    </div>
  );
}

/** Morceau de bande entre deux sommets de la ligne de déchirure (découpe fixe, bord du bas dentelé). */
function TearPiece(props: {
  from: TearPoint;
  to: TearPoint;
  band: ReactNode;
  progress: MotionValue<number>;
  direction: 1 | -1;
  originX: MotionValue<number>;
  reduced: boolean;
}) {
  const { from, to, band, progress, direction, originX, reduced } = props;
  // Une fois arraché, le morceau se soulève avec le reste de la partie déchirée
  const rotate = useTransform(progress, (p) => (!reduced && pieceTorn(p, direction, from[0], to[0]) ? direction * Math.min(16, p * 32) : 0));
  const y = useTransform(progress, (p) => (!reduced && pieceTorn(p, direction, from[0], to[0]) ? -p * 6 : 0));
  // Léger recouvrement pour qu'aucune fente n'apparaisse entre deux morceaux à plat
  const left = Math.max(0, from[0] - 0.3);
  const right = Math.min(100, to[0] + 0.3);
  return (
    <m.div
      className="absolute inset-0"
      style={{ clipPath: `polygon(${left}% 0, ${right}% 0, ${right}% ${to[1]}%, ${left}% ${from[1]}%)`, originX, originY: 0.9, rotate, y }}
    >
      {band}
    </m.div>
  );
}

/** Liseré de fibres blanches qui apparaît sous un morceau une fois arraché. */
function FiberEdge({ from, to, progress, direction }: { from: TearPoint; to: TearPoint; progress: MotionValue<number>; direction: 1 | -1 }) {
  const opacity = useTransform(progress, (p) => (pieceTorn(p, direction, from[0], to[0]) ? 0.9 : 0));
  return (
    <m.span
      className="pointer-events-none absolute inset-0 bg-washi-paper"
      style={{
        opacity,
        clipPath: `polygon(${from[0]}% ${from[1] - 2}%, ${to[0]}% ${to[1] - 2}%, ${to[0]}% ${to[1] + 6}%, ${from[0]}% ${from[1] + 6}%)`,
      }}
    />
  );
}

/** Fibres de papier qui jaillissent du point de déchirure (8 au plus, rejouées en suivant le doigt). */
function Fibers({ progress, direction }: { progress: MotionValue<number>; direction: 1 | -1 }) {
  const [burst, setBurst] = useState<{ at: number; step: number } | null>(null);
  const step = useRef(-1);
  useEffect(
    () =>
      progress.on("change", (p) => {
        const s = Math.floor(p * 6);
        if (s !== step.current && p > 0 && p < 1) {
          step.current = s;
          setBurst({ at: p, step: s });
        }
      }),
    [progress],
  );
  if (burst === null) return null;
  return (
    <span key={burst.step} className="pointer-events-none absolute bottom-0" style={{ left: `${4 + (direction === 1 ? burst.at : 1 - burst.at) * 92}%` }}>
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="fx-fiber"
          style={
            {
              "--dx": `${(i - 4) * 7}px`,
              "--dy": `${-14 - (i % 3) * 9}px`,
              "--r": `${i * 40}deg`,
              "--d": `${i * 0.02}s`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Rabat du pochibukuro : se soulève avec le doigt (charnière en haut), le cordon se dénoue. */
function PochiFlap({ progress, gesture }: { progress: MotionValue<number>; gesture?: Gesture }) {
  const rotateX = useTransform(progress, [0, 1], [0, -165]);
  const cord = useTransform(progress, [0, 0.4], [1, 0]);
  return (
    <div className={`${POCHI_BODY} z-30 touch-none [perspective:600px]`} {...gesture}>
      <m.div className="booster-cord absolute inset-x-0 top-[58%] h-[4cqw]" style={{ opacity: cord, scaleX: cord }} />
      <m.div className="booster-flap absolute inset-x-0 top-0 h-[40%] origin-top" style={{ rotateX }} />
    </div>
  );
}

/** Couvercle du jūbako : le cordon se défait, puis le couvercle se lève et bascule. */
function JubakoLid({ progress, gesture }: { progress: MotionValue<number>; gesture?: Gesture }) {
  const y = useTransform(progress, [0, 1], ["0%", "-140%"]);
  const rotate = useTransform(progress, [0.4, 1], [0, -12]);
  const cord = useTransform(progress, [0, 0.35], [1, 0]);
  return (
    <div className="absolute inset-0 z-30 touch-none" {...gesture}>
      <m.div className={`booster-cord-v ${JUBAKO_CORD}`} style={{ opacity: cord, scaleY: cord }} />
      <m.div className={`booster-lid ${JUBAKO_LID}`} style={{ y, rotate }} />
    </div>
  );
}

/**
 * Au repos : halo à la couleur du booster qui respire derrière lui, et reflet au sol qui suit le
 * flottement. Il s'éteint dès que le geste d'ouverture commence.
 */
function IdleHalo({ progress, color, reduced }: { progress: MotionValue<number>; color: string; reduced: boolean }) {
  const opacity = useTransform(progress, [0, 0.12], [1, 0]);
  return (
    <m.span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ opacity }}>
      <span className="absolute inset-0" style={{ "--halo": color } as CSSProperties}>
        <span className={`booster-halo ${reduced ? "" : "booster-halo-breathe"}`} />
        <span className={`booster-floor ${reduced ? "" : "booster-floor-float"}`} />
      </span>
    </m.span>
  );
}

/** Lumière issue de la fente : charge, flash unique, faisceau et étincelles, à la couleur de la meilleure carte. */
function Leak({
  progress,
  color,
  strong,
  shape,
  reduced,
}: {
  progress: MotionValue<number>;
  /** null tant que le serveur n'a pas répondu : fente blanche, pas de halo coloré. */
  color: string | null;
  strong: boolean;
  shape: BoosterShape;
  reduced: boolean;
}) {
  const opacity = useTransform(progress, [0, 0.35, 1], [0, 0.3, reduced ? 0.4 : 0.85]);
  const top = shape === "SACHET" ? "top-[13%]" : shape === "POCHIBUKURO" ? "top-[20%]" : "top-[8%]";
  return (
    <span
      aria-hidden="true"
      className={`booster-opening-light pointer-events-none absolute inset-x-0 ${top} z-40 h-0`}
      style={{ "--opening-light": color ?? "rgb(255 250 235 / 0.3)" } as CSSProperties}
    >
      {color && (
        <m.span
          className="absolute left-1/2 size-[150cqw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ opacity, background: `radial-gradient(circle, ${color}, transparent 60%)` }}
        />
      )}
      <m.span className="booster-opening-seam" style={{ opacity, scaleX: progress }} />
      {strong && !reduced && (
        <>
          <span className="booster-opening-beam-anchor">
            <m.span
              className="booster-opening-beam"
              initial={{ opacity: 0, scaleX: 0.2, scaleY: 0.15 }}
              animate={{ opacity: [0, 1, 0.65], scaleX: [0.2, 1.15, 1], scaleY: [0.15, 1, 1] }}
              transition={{ duration: 0.8, times: [0, 0.25, 1], ease: "easeOut" }}
            />
          </span>
          <span className="booster-opening-burst-anchor">
            <m.span
              className="booster-opening-flash"
              initial={{ opacity: 0, scale: 0.15 }}
              animate={{ opacity: [0, 1, 0.75, 0], scale: [0.15, 0.65, 1.1, 1.5] }}
              transition={{ duration: 0.85, times: [0, 0.14, 0.35, 1], ease: "easeOut" }}
            />
            <m.span
              className="booster-opening-ring"
              initial={{ opacity: 0.85, scale: 0.2 }}
              animate={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </span>
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className="booster-opening-spark"
              style={{
                "--spark-x": `${(i - 6.5) * 16}px`,
                "--spark-y": `${-70 - ((i * 37) % 140)}px`,
                "--spark-delay": `${(i % 4) * 0.035}s`,
                left: `${15 + (i / 13) * 70}%`,
              } as CSSProperties}
            />
          ))}
        </>
      )}
    </span>
  );
}

/**
 * Inclinaison 3D du booster (souris ou gyroscope), appliquée en requestAnimationFrame. `--tx` n'est
 * posée que sur le reflet qui la lit : sur le booster entier, elle invalidait le style de tout le
 * dessin (et des morceaux de bande) à chaque image.
 */
function useTilt(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const glints = Array.from(el.querySelectorAll<HTMLElement>(".booster-glint"));
    let frame = 0;
    let target = { x: 0.5, y: 0.5 };
    const apply = () => {
      frame = 0;
      el.style.transform = `rotateY(${((target.x - 0.5) * 18).toFixed(2)}deg) rotateX(${((0.5 - target.y) * 14).toFixed(2)}deg)`;
      for (const glint of glints) glint.style.setProperty("--tx", target.x.toFixed(3));
    };
    const schedule = (x: number, y: number) => {
      target = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onPointer = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      schedule(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      schedule(0.5 + e.gamma / 70, 0.5 + (e.beta - 45) / 70);
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onTilt);
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty("transform");
      for (const glint of glints) glint.style.removeProperty("--tx");
    };
  }, [ref, enabled]);
}
