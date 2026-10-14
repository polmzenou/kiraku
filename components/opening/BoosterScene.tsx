"use client";

import { animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { BoosterShape, BoosterTheme } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { BoosterArt, JUBAKO_CORD, JUBAKO_LID, POCHI_BODY } from "../boosters/BoosterArt";
import { LEAK_COLOR } from "./RarityFx";

/** Part du geste à partir de laquelle l'ouverture est envoyée au serveur. */
const TRIGGER_AT = 0.3;
/** Segments de la bande du sachet : chacun se détache quand le doigt le dépasse. */
const SEGMENTS = 12;

export type SceneHandle = { open: () => void };

type Props = {
  shape: BoosterShape;
  theme: BoosterTheme;
  emblem: string;
  name: string;
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
  /** Appelé une fois, dès 30 % du geste (ou au bouton). */
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
  const fired = useRef(false);
  const completing = useRef(false);
  const tilt = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; size: number } | null>(null);
  const { onTrigger, onOpened, onTearSound, openRef } = props;

  useTilt(tilt, !reduced);

  const fire = () => {
    if (fired.current || !armed) return;
    fired.current = true;
    onTrigger();
  };

  const complete = () => {
    if (completing.current || !armed) return;
    completing.current = true;
    fire();
    onTearSound();
    if (reduced) {
      progress.set(1);
      setOpened(true);
      onOpened();
      return;
    }
    animate(progress, 1, { duration: 0.18 }).then(() => setOpened(true));
    // Filet de sécurité : si l'onglet ne dessine plus (arrière-plan), l'ouverture ne reste pas bloquée
    setTimeout(() => {
      setOpened(true);
      onOpened();
    }, 1400);
  };

  useEffect(() => {
    openRef?.({ open: complete });
  });

  const vertical = shape !== "SACHET";
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!armed || completing.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, size: vertical ? r.height : r.width };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const travel = vertical ? d.y - e.clientY : Math.abs(e.clientX - d.x);
    const p = Math.min(1, Math.max(0, travel / (d.size * (vertical ? 0.45 : 0.75))));
    if (p > progress.get()) progress.set(p);
    if (p >= TRIGGER_AT) fire();
    if (p >= 1) complete();
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    // Une fois l'ouverture envoyée, on termine le geste ; sinon tout revient en place
    if (fired.current) complete();
    else animate(progress, 0, { duration: 0.25 });
  };
  const gesture = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };

  const leakColor = leak ? LEAK_COLOR[leak] : "rgb(244 237 224 / 0.35)";

  const overlay = (
    <>
      {/* Lumière qui s'échappe de l'ouverture */}
      <Leak progress={progress} color={leakColor} strong={leak !== null && opened} shape={shape} reduced={reduced} />
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
      {shape === "POCHIBUKURO" && <PochiFlap progress={progress} gesture={armed ? gesture : undefined} />}
      {shape === "JUBAKO" && <JubakoLid progress={progress} gesture={armed ? gesture : undefined} />}
    </>
  );

  return (
    <div className="relative w-[min(16rem,66vw)] [perspective:1000px]">
      {count > 1 && (
        <>
          <div aria-hidden="true" className="absolute inset-0 translate-x-4 translate-y-3 rotate-[4deg] opacity-45">
            <BoosterArt shape={shape} theme={theme} emblem={emblem} name="" contents={contents} compact />
          </div>
          <div aria-hidden="true" className="absolute inset-0 translate-x-2 translate-y-1.5 rotate-2 opacity-70">
            <BoosterArt shape={shape} theme={theme} emblem={emblem} name="" contents={contents} compact />
          </div>
        </>
      )}
      <div className={reduced ? "" : "booster-idle"}>
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
                      armed={armed}
                      gesture={gesture}
                      onFlown={() => onOpened()}
                    />
                  )
                : undefined
            }
          />
        </div>
      </div>
      {/* Pochibukuro et jūbako : fin de l'ouverture quand le rabat ou le couvercle est parti */}
      {shape !== "SACHET" && opened && <Done onDone={onOpened} delay={reduced ? 0 : 450} />}
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
  armed: boolean;
  gesture: Gesture;
  onFlown: () => void;
}) {
  const { band, progress, opened, reduced, armed, gesture, onFlown } = props;
  const flown = useRef(0);
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-0 z-30 h-[13%] touch-pan-y ${armed ? "cursor-grab active:cursor-grabbing" : ""}`}
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
          onFlown={() => {
            flown.current += 1;
            if (flown.current === SEGMENTS) onFlown();
          }}
        />
      ))}
      {/* Ligne lumineuse qui suit la déchirure */}
      <m.span
        className="absolute inset-x-[4%] bottom-0 h-[3px] origin-left rounded-full bg-washi-paper shadow-[0_0_8px_rgb(255_255_255/0.9)]"
        style={{ scaleX: progress }}
      />
      {!reduced && <Fibers progress={progress} />}
    </div>
  );
}

function Segment({
  index,
  band,
  progress,
  opened,
  reduced,
  onFlown,
}: {
  index: number;
  band: ReactNode;
  progress: MotionValue<number>;
  opened: boolean;
  reduced: boolean;
  onFlown: () => void;
}) {
  const start = index / SEGMENTS;
  const end = (index + 1) / SEGMENTS;
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
      transition={{ duration: reduced ? 0.15 : 0.55, delay: reduced ? 0 : index * 0.025, ease: [0.3, 0.6, 0.3, 1] }}
      onAnimationComplete={() => {
        if (opened) onFlown();
      }}
    >
      {band}
    </m.div>
  );
}

/** Fibres de papier qui jaillissent du point de déchirure (8 au plus, rejouées en suivant le doigt). */
function Fibers({ progress }: { progress: MotionValue<number> }) {
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
    <span key={burst.step} className="pointer-events-none absolute bottom-0" style={{ left: `${4 + burst.at * 92}%` }}>
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

/** Lueur à l'ouverture : discrète pendant le geste, puis rayons à la couleur de la meilleure carte. */
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
  const opacity = useTransform(progress, [0, 1], [0, 0.85]);
  const top = shape === "SACHET" ? "top-[13%]" : shape === "POCHIBUKURO" ? "top-[20%]" : "top-[8%]";
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 ${top} z-10 h-0`}>
      <m.span
        className="absolute left-1/2 size-[120cqw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ opacity, background: `radial-gradient(circle, ${color}, transparent 60%)` }}
      />
      {strong && !reduced && (
        <m.span
          className="light-rays absolute left-1/2 size-[200cqw] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ ["--leak" as string]: color }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.9, scale: 1 }}
          transition={{ duration: 0.5 }}
        />
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
    };
  }, [ref, enabled]);
}
