"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CASINO_MEDIA } from "@/lib/casino/media";
import { flipCurves } from "@/lib/casino/choreography";
import { seededFloat } from "@/lib/rng";
import { playSound, type SoundName } from "@/lib/sound/synth";
import { useFxLevel } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { animate, createTimeline, dispose, later, removeWhenDone, skip, type Timeline } from "../shop/celebration/timeline";
import "./casino.css";

const BOARD = { w: 375, h: 760 } as const;
// Le sceau 開店 se pose quand les portes ont fini de s'ouvrir dans la vidéo
const STAMP_AT = 7000;
const OPEN_LOOP_AT = 7850;
const SETTLE_AT = 8600;

const SOUNDS: { t: number; name: SoundName; volume: number }[] = [
  { t: 250, name: "clack", volume: 0.55 },
  ...[1300, 1850, 2400, 2950, 3500].map((t) => ({ t, name: "lamp" as const, volume: 0.35 })),
  { t: 4250, name: "taiko", volume: 0.8 },
  { t: 4300, name: "whoosh", volume: 0.4 },
  { t: 5900, name: "chime", volume: 0.35 },
  { t: 7280, name: "stamp", volume: 0.85 },
  { t: 7450, name: "chime", volume: 0.5 },
];

/**
 * Cérémonie d'ouverture (une fois par appareil) : deux claquements de hyōshigi, les lanternes s'allument une à
 * une, les shōji coulissent et le noren tombe (vidéo peinte), puis le sceau 開店 frappe, l'éclat doré et la
 * feuille d'or. Un appui passe à la façade ouverte.
 */
export function InaugurationCeremony({ onDone }: { onDone: () => void }) {
  const t = useTranslations("casino.ceremony");
  const tCasino = useTranslations("casino");
  const fxLevel = useFxLevel();
  const { enabled: soundOn } = useRitualFx();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const ceremony = useRef<HTMLVideoElement>(null);
  const openLoop = useRef<HTMLVideoElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const soundRef = useRef(soundOn);
  const [scale, setScale] = useState(1);
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const fit = () => setScale(Math.min(1.25, window.innerWidth / BOARD.w, window.innerHeight / BOARD.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const showOpen = useCallback(() => {
    const loop = openLoop.current;
    if (!loop) return;
    loop.currentTime = 0;
    loop.play().catch(() => undefined);
  }, []);

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettled(true);
    requestAnimationFrame(() => enter.current?.focus());
  }, []);

  const pass = useCallback(() => {
    if (settledRef.current || !timeline.current) return;
    skip(timeline.current);
    ceremony.current?.pause();
    showOpen();
    settle();
  }, [settle, showOpen]);

  useEffect(() => {
    const root = board.current;
    if (!root) return;
    const tl = createTimeline(false);
    timeline.current = tl;
    const C = flipCurves(typeof CSS !== "undefined" && Boolean(CSS.supports?.("transition-timing-function", "linear(0, 1)")));
    const q = <E extends Element>(sel: string) => root.querySelector<E>(sel);
    const node = (sel: string) => q<HTMLElement>(sel);

    // La vidéo ne peut pas se lancer (économie d'énergie) : façade ouverte et sceau tout de suite
    const video = ceremony.current;
    if (video) {
      video.muted = true;
      video.play().catch(() => pass());
    }
    for (const s of SOUNDS) later(tl, s.t, () => soundRef.current && playSound(s.name, s.volume));

    const seal = node(".cf-cer-seal");
    if (seal) {
      animate(
        tl,
        seal,
        [
          { transform: "scale(2.5) rotate(-21deg)", opacity: 0, easing: "cubic-bezier(0.55, 0, 0.85, 0.4)" },
          { transform: "scale(0.93) rotate(-6deg)", opacity: 1, offset: 0.55, easing: C.snap },
          { transform: "scale(1) rotate(-7deg)", opacity: 1 },
        ],
        { delay: STAMP_AT, duration: 560, easing: "linear" },
      );
    }
    const ring = node(".cf-cer-ring");
    // Pas de remplissage avant le départ : l'anneau resterait visible pendant toute l'attente
    if (ring) animate(tl, ring, [{ transform: "scale(0.4)", opacity: 0.95 }, { transform: "scale(2.3)", opacity: 0 }], { delay: STAMP_AT + 300, duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
    const burst = node(".cf-cer-burst");
    if (burst) {
      animate(
        tl,
        burst,
        [
          { transform: "rotate(0deg) scale(0.5)", opacity: 0 },
          { transform: "rotate(10deg) scale(1)", opacity: 0.95, offset: 0.2 },
          { transform: "rotate(40deg) scale(1.08)", opacity: 0.5 },
        ],
        { delay: STAMP_AT + 150, duration: 3400, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
      );
    }
    const loop = openLoop.current;
    if (loop) {
      later(tl, OPEN_LOOP_AT, showOpen);
      animate(tl, loop, [{ opacity: 0 }, { opacity: 1 }], { delay: OPEN_LOOP_AT + 50, duration: 400, easing: "linear" });
    }
    root.querySelectorAll<HTMLElement>(".cf-cer-copy > *").forEach((el, k) => {
      animate(tl, el, [{ transform: "translateY(14px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }], {
        delay: OPEN_LOOP_AT - 150 + k * 120,
        duration: 520,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    });

    // Feuilles d'or et étincelles au coup de sceau (moins en effets allégés)
    const layer = node(".cf-fx");
    if (layer) {
      const rand = seededFloat(20261201);
      const lite = fxLevel === "lite";
      for (let i = 0; i < (lite ? 12 : 30); i++) {
        const f = document.createElement("span");
        f.className = "cf-kp";
        const w = 12 + rand() * 22;
        const cell = Math.floor(rand() * 16);
        f.style.cssText = `left:${2 + rand() * 92}%;width:${w}px;height:${w}px;background-position:${(cell % 4) * 33.333}% ${Math.floor(cell / 4) * 33.333}%`;
        layer.append(f);
        const dx = (rand() - 0.5) * 100;
        const r0 = rand() * 360;
        const r1 = r0 + (rand() - 0.5) * 760;
        const fall = 820;
        removeWhenDone(
          animate(
            tl,
            f,
            [
              { transform: `translate(0px, -40px) rotate(${r0}deg)`, opacity: 0 },
              { transform: `translate(${dx * 0.1}px, ${fall * 0.08}px) rotate(${r0 + (r1 - r0) * 0.1}deg)`, opacity: 1, offset: 0.1 },
              { transform: `translate(${dx * 0.8}px, ${fall * 0.82}px) rotate(${r0 + (r1 - r0) * 0.82}deg)`, opacity: 0.9, offset: 0.82 },
              { transform: `translate(${dx}px, ${fall}px) rotate(${r1}deg)`, opacity: 0 },
            ],
            { delay: STAMP_AT + 250 + rand() * 1000, duration: 2300 + rand() * 1500, easing: "cubic-bezier(0.3, 0.1, 0.6, 1)" },
          ),
          f,
        );
      }
      for (let i = 0; i < (lite ? 8 : 16); i++) {
        const d = document.createElement("span");
        d.className = "cf-spark";
        d.style.left = "187px";
        d.style.top = "486px";
        layer.append(d);
        const ang = rand() * Math.PI * 2;
        const dist = 50 + rand() * 120;
        const s = 0.6 + rand() * 0.9;
        const dx = Math.cos(ang) * dist;
        const dy = Math.sin(ang) * dist * 0.8;
        removeWhenDone(
          animate(
            tl,
            d,
            [
              { transform: `translate(0px, 0px) scale(${s})`, opacity: 0 },
              { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(${s})`, opacity: 1, offset: 0.15 },
              { transform: `translate(${dx}px, ${dy + 34}px) scale(${s * 0.4})`, opacity: 0 },
            ],
            { delay: STAMP_AT + 300 + rand() * 120, duration: 650 + rand() * 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          ),
          d,
        );
      }
    }
    later(tl, SETTLE_AT, settle);
    return () => dispose(tl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jouée une seule fois, au montage
  }, []);

  // <dialog> modal : le focus reste dans la cérémonie et la page dessous devient inerte. Ouvert avant le premier
  // affichage (la cérémonie est cachée tant qu'il est fermé).
  useLayoutEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="cf-overlay"
      aria-labelledby={titleId}
      onPointerDown={settled ? undefined : pass}
      onCancel={(e) => {
        // Échap pendant la cérémonie : elle passe à la façade ouverte ; ensuite, elle se ferme
        if (settledRef.current) return;
        e.preventDefault();
        pass();
      }}
      onClose={onDone}
    >
      <div ref={board} className="cf-board" style={{ "--cf-scale": scale } as CSSProperties}>
        <video
          ref={ceremony}
          src={CASINO_MEDIA.facade.ceremony}
          poster={CASINO_MEDIA.facade.closed.mobile.still}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <video
          ref={openLoop}
          src={CASINO_MEDIA.facade.open.mobile.loop}
          poster={CASINO_MEDIA.facade.open.mobile.still}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 -z-10 size-full object-cover opacity-0"
        />
        <span aria-hidden="true" className="absolute inset-0 z-1 bg-[linear-gradient(180deg,rgb(13_14_23/0.6),transparent_13%,transparent_50%,rgb(21_18_15/0.82)_64%,var(--color-bg)_86%)]" />
        <header className="cf-top">
          <span className="cf-top-title">{tCasino("title")}</span>
          <span className="rounded-pill bg-shu-btn px-2.5 py-0.5 text-xs font-bold text-washi-paper">{tCasino("hall.coinflip.tag")}</span>
          {!settled && (
            <button type="button" onClick={pass} className="cf-skip">
              {t("skip")}
            </button>
          )}
        </header>
        <div className="cf-fx" aria-hidden="true" />
        <div aria-hidden="true" className="absolute top-[486px] left-1/2 z-6 size-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- lumière sur noir fondue en « screen », taille fixe */}
          <img src={CASINO_MEDIA.fx.burst} alt="" className="cf-cer-burst absolute -top-[170px] -left-[170px] size-[340px] max-w-none opacity-0 mix-blend-screen" />
          <span className="cf-cer-ring absolute -top-16 -left-16 size-32 rounded-full border-3 border-shu opacity-0" />
          <span lang="ja" className="cf-cer-seal cf-hk absolute -top-[52px] -left-[52px] flex size-[104px] text-[42px] opacity-0 shadow-[0_16px_40px_rgb(0_0_0/0.5)]">
            開店
          </span>
        </div>
        <div className="cf-cer-copy absolute inset-x-5 bottom-6 z-5 flex flex-col gap-2.5">
          <p className="text-xs font-bold tracking-[0.14em] text-kin uppercase opacity-0">{t("kicker")}</p>
          <h2 id={titleId} className="font-heading text-[25px] leading-tight font-normal text-balance opacity-0">
            {t("title")}
          </h2>
          <p className="text-sm text-text/80 opacity-0">{t("body")}</p>
          <button
            ref={enter}
            type="button"
            onClick={onDone}
            className="inline-flex min-h-12 items-center justify-center rounded-control bg-shu-btn px-5 font-bold text-washi-paper opacity-0 shadow-shu"
          >
            {t("enter")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
