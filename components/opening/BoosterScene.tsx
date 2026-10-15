"use client";

import { animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { BoosterShape, BoosterTheme } from "@/lib/boosters/types";
import { openingGestureProgress, startOpeningGesture, type OpeningGesture } from "@/lib/boosters/opening-gesture";
import type { Rarity } from "@/lib/catalog/rarity";
import { BoosterArt, JUBAKO_CORD, JUBAKO_LID, POCHI_BODY } from "../boosters/BoosterArt";
import { LEAK_COLOR } from "./RarityFx";

/** Part du geste à partir de laquelle l'ouverture est envoyée au serveur. */
const TRIGGER_AT = 0.55;
/** Segments de la bande du sachet : chacun se détache quand le doigt le dépasse. */
const SEGMENTS = 12;

export type SceneHandle = { open: () => void };

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
  /** Meilleure rareté du tirage, dès que le serveur a répondu : couleur de la lumière qui s'échappe. */
  leak: Rarity | null;
  /** Le serveur a décidé d'un sachet doré ou divin : la matière se révèle pendant l'ouverture. */
  variant?: "golden" | "divine";
  /** Appelé une fois, une fois la coupe engagée (ou au clic). */
  onTrigger: () => void;
  /** L'ouverture est finie (bande envolée, rabat ouvert, couvercle levé). */
  onOpened: () => void;
  onTearSound: () => void;
  /** Le parent déclenche l'ouverture au bouton. */
  openRef?: (handle: SceneHandle) => void;
};

/**
 * Le booster présenté seul au centre de la scène : il flotte, suit l'inclinaison du téléphone (ou
 * la souris) et s'ouvre d'un geste. Sachet : on déchire la bande du haut d'un glissement horizontal ;
 * pochibukuro et jūbako : on glisse vers le haut pour soulever le rabat ou le couvercle.
 */
export function BoosterScene(props: Props) {
  const { shape, theme, emblem, name, tagline, contents, count, armed, reduced, leak, variant } = props;
  const progress = useMotionValue(0);
  const [opened, setOpened] = useState(false);
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

  useTilt(tilt, !reduced && !opened);

  useEffect(() => () => {
    if (fallback.current) clearTimeout(fallback.current);
    animation.current?.stop();
  }, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    onOpened();
  };

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
    const opening = animate(progress, 1, { duration: 0.22, ease: "easeOut" });
    animation.current = opening;
    opening.then(() => setOpened(true));
    // Filet de sécurité : si l'onglet ne dessine plus (arrière-plan), l'ouverture ne reste pas bloquée
    fallback.current = setTimeout(() => {
      setOpened(true);
      finish();
    }, 1700);
  };

  useEffect(() => {
    openRef?.({ open: complete });
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

  const leakColor = leak ? LEAK_COLOR[leak] : theme.base;

  const overlay = (
    <>
      {/* Lumière qui s'échappe de l'ouverture */}
      <Leak progress={progress} color={leakColor} strong={opened} shape={shape} reduced={reduced} />
      {/* Matière du sachet doré ou divin, révélée pendant l'ouverture */}
      {variant && (
        <m.span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-20 ${variant === "divine" ? "fx-nacre opacity-80" : ""}`}
          style={
            variant === "golden"
              ? {
                  background:
                    "radial-gradient(circle, rgb(255 246 214 / 0.95) 0 1px, transparent 1.6px) 0 0 / 11px 15px, linear-gradient(135deg, rgb(242 216 138 / 0.75), rgb(184 144 47 / 0.55) 50%, rgb(242 216 138 / 0.75))",
                  mixBlendMode: "hard-light",
                }
              : undefined
          }
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {shape === "POCHIBUKURO" && <PochiFlap progress={progress} gesture={gesture} />}
      {shape === "JUBAKO" && <JubakoLid progress={progress} gesture={gesture} />}
    </>
  );

  return (
    <div
      role="button"
      tabIndex={armed ? 0 : -1}
      aria-label={props.openLabel}
      aria-disabled={!armed}
      className={`relative w-[min(16rem,66vw)] rounded-xl outline-offset-8 [perspective:1000px] ${armed ? "cursor-pointer" : ""}`}
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
        <div ref={tilt} className="relative transition-transform duration-150 ease-out [transform-style:preserve-3d]">
          <BoosterArt
            shape={shape}
            theme={theme}
            emblem={emblem}
            name={name}
            tagline={tagline}
            contents={contents}
            hideCover={shape !== "SACHET"}
            overlay={overlay}
            renderBand={
              shape === "SACHET"
                ? (band) => (
                    <TearBand
                      band={band}
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
        </div>
      </m.div>
      {/* Pochibukuro et jūbako : fin de l'ouverture quand le rabat ou le couvercle est parti */}
      {shape !== "SACHET" && opened && <Done onDone={finish} delay={reduced ? 0 : 800} />}
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
 * Bande du sachet en 12 segments (copies de la bande découpées, découpe fixe) : chacun se soulève
 * quand le doigt le dépasse, puis tous s'envolent l'un après l'autre. Des fibres de washi jaillissent.
 */
function TearBand(props: {
  band: ReactNode;
  progress: MotionValue<number>;
  opened: boolean;
  reduced: boolean;
  direction: 1 | -1;
  armed: boolean;
  gesture: Gesture;
  onFlown: () => void;
}) {
  const { band, progress, opened, reduced, direction, armed, gesture, onFlown } = props;
  const [removed, setRemoved] = useState(false);
  const onFlownRef = useRef(onFlown);
  useEffect(() => { onFlownRef.current = onFlown; }, [onFlown]);
  useEffect(() => {
    if (!opened) return;
    // Retirer le DOM après le dernier segment, même si Motion interrompt un callback.
    const timeout = setTimeout(() => {
      setRemoved(true);
      onFlownRef.current();
    }, reduced ? 0 : 850);
    return () => clearTimeout(timeout);
  }, [opened, reduced]);
  if (removed) return null;
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-0 z-30 h-[13%] min-h-11 touch-none ${armed ? "cursor-crosshair" : ""}`}
      {...gesture}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <Segment
          key={i}
          index={i}
          band={band}
          progress={progress}
          opened={opened}
          reduced={reduced}
          direction={direction}
        />
      ))}
      {/* Ligne lumineuse qui suit la déchirure */}
      <m.span
        className="pointer-events-none absolute inset-x-[4%] bottom-0 h-[3px] rounded-full bg-washi-paper shadow-[0_0_8px_rgb(255_255_255/0.9)]"
        style={{ scaleX: progress, transformOrigin: direction === 1 ? "left" : "right" }}
      />
      {!reduced && <Fibers progress={progress} direction={direction} />}
    </div>
  );
}

function Segment({
  index,
  band,
  progress,
  opened,
  reduced,
  direction,
}: {
  index: number;
  band: ReactNode;
  progress: MotionValue<number>;
  opened: boolean;
  reduced: boolean;
  direction: 1 | -1;
}) {
  const order = direction === 1 ? index : SEGMENTS - 1 - index;
  const start = order / SEGMENTS;
  const end = (order + 1) / SEGMENTS;
  // Soulèvement progressif du segment quand la déchirure le traverse
  const lift = useTransform(progress, [start, end], [0, -5]);
  const tiltZ = useTransform(progress, [start, end], [0, index % 2 ? -5 : 4]);
  const left = `${(index / SEGMENTS) * 100}%`;
  const right = `${100 - ((index + 1) / SEGMENTS) * 100}%`;
  return (
    <m.div
      className="absolute inset-0"
      style={{ clipPath: `inset(0 ${right} 0 ${left})`, y: opened ? undefined : lift, rotate: opened ? undefined : tiltZ }}
      animate={
        opened
          ? reduced
            ? { opacity: 0 }
            : { y: "-220%", x: `${(index - SEGMENTS / 2) * 6}%`, rotate: (index % 2 ? -1 : 1) * (20 + index * 3), opacity: 0 }
          : undefined
      }
      transition={{ duration: reduced ? 0.15 : 0.55, delay: reduced ? 0 : order * 0.025, ease: [0.3, 0.6, 0.3, 1] }}
    >
      {band}
    </m.div>
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

/** Lumière issue de la fente : charge, flash unique, faisceau et étincelles. */
function Leak({
  progress,
  color,
  strong,
  shape,
  reduced,
}: {
  progress: MotionValue<number>;
  color: string;
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
      style={{ "--opening-light": color } as CSSProperties}
    >
      <m.span
        className="absolute left-1/2 size-[150cqw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ opacity, background: `radial-gradient(circle, ${color}, transparent 60%)` }}
      />
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

/** Inclinaison 3D du booster (souris ou gyroscope), appliquée en requestAnimationFrame. */
function useTilt(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let frame = 0;
    let target = { x: 0.5, y: 0.5 };
    const apply = () => {
      frame = 0;
      el.style.transform = `rotateY(${((target.x - 0.5) * 18).toFixed(2)}deg) rotateX(${((0.5 - target.y) * 14).toFixed(2)}deg)`;
      el.style.setProperty("--tx", target.x.toFixed(3));
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
      el.style.removeProperty("--tx");
    };
  }, [ref, enabled]);
}
