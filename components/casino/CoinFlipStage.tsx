"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flipCurves, flipFx, flipScript, NO_OPACITY, BASE, opacityKeyframes, seedOf, toKeyframes, type Track } from "@/lib/casino/choreography";
import type { CoinSide } from "@/lib/casino/fairness";
import { CASINO_MEDIA, coinImage, SIDE_KANJI } from "@/lib/casino/media";
import { flipStaging } from "@/lib/casino/tiers";
import type { CardView } from "@/lib/boosters/view";
import type { PlayerRef } from "@/server/profile/decor";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { prefersReducedMotion } from "@/lib/motion-pref-dom";
import { playSound } from "@/lib/sound/synth";
import { Fuda } from "../fuda/Fuda";
import { useFxLevel } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { animate, createTimeline, dispose, later, removeWhenDone, skip, type Timeline } from "../shop/celebration/timeline";
import { PlayerAvatar } from "../social/PlayerAvatar";
import { LoopBackdrop } from "./LoopBackdrop";
import "./casino.css";

export type StageSeat = {
  player: PlayerRef;
  card: CardView;
  side: CoinSide;
  /** Le joueur qui regarde (« Toi »). */
  you: boolean;
};

const BOARD = { w: 375, h: 760 } as const;
const EDGES = [-3, -2, -1, 0, 1, 2, 3];

/** Générateur à graine pour la position des étincelles et des feuilles d'or. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Le lancer, en plein écran : face-à-face et 対, la pièce part du pouce (ou se dresse en toupie pour les gros
 * pots), le sceau de la face gagnante frappe, le pot file vers le gagnant, puis 勝 ou 負 et la tablette du
 * résultat. L'issue est connue avant le premier mouvement (fixée par le serveur). Un appui passe l'animation ;
 * en mouvement réduit, la scène s'ouvre directement sur l'état final.
 */
export function CoinFlipStage({
  flipId,
  top,
  bottom,
  result,
  rarity,
  title,
  tablet,
  outroLabel,
  onSettled,
}: {
  flipId: string;
  /** L'autre joueur (en haut). */
  top: StageSeat;
  /** Le joueur qui regarde (en bas). */
  bottom: StageSeat;
  result: CoinSide;
  /** Rareté du pot : chorégraphie et intensité. */
  rarity: string;
  title: string;
  /** Panneau du résultat, qui monte à la fin. */
  tablet: ReactNode;
  /** Phrase sous 勝 ou 負. */
  outroLabel: string;
  /** Fin du déroulé (ou animation passée) : la tablette est en place. */
  onSettled?: () => void;
}) {
  const t = useTranslations("casino.stage");
  const tRarity = useTranslations("rarity");
  const definitions = useRarityDefinitions();
  const fxLevel = useFxLevel();
  const { enabled: soundOn, setEnabled: setSound } = useRitualFx();
  const titleId = useId();
  const bottomWins = result === bottom.side;
  const staging = flipStaging(rarity, definitions);
  const seal = definitions.find((d) => d.key === rarity)?.seal ?? "";

  const [scale, setScale] = useState(1);
  const [settled, setSettled] = useState(false);
  const soundRef = useRef(soundOn);
  const timeline = useRef<Timeline | null>(null);
  const settledRef = useRef(false);
  const skipButton = useRef<HTMLButtonElement>(null);
  const tabletRef = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  // Plateau mis à l'échelle de l'écran, jamais plus grand que 1,25 fois sa taille
  useEffect(() => {
    const fit = () => setScale(Math.min(1.25, window.innerWidth / BOARD.w, window.innerHeight / BOARD.h));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettled(true);
    onSettled?.();
    // Le focus passe au premier bouton de la tablette
    requestAnimationFrame(() => tabletRef.current?.querySelector<HTMLElement>("a, button")?.focus());
  }, [onSettled]);

  const pass = useCallback(() => {
    if (settledRef.current || !timeline.current) return;
    skip(timeline.current);
    settle();
  }, [settle]);

  // Le déroulé se compose une seule fois, au montage : l'issue ne change plus
  useEffect(() => {
    const reduced = prefersReducedMotion() || fxLevel === "reduced";
    const tl = createTimeline(reduced);
    timeline.current = tl;
    const linear = typeof CSS !== "undefined" && CSS.supports?.("transition-timing-function", "linear(0, 1)");
    const fx = flipFx(staging.level);
    const script = flipScript({
      result,
      topSide: top.side,
      bottomWins,
      choreography: staging.choreography,
      fx,
      curves: flipCurves(Boolean(linear)),
      seed: seedOf(flipId),
    });
    const root = board.current;
    const node = (track: Track) => root?.querySelector<HTMLElement>(`[data-track="${track}"]`) ?? null;
    for (const [track, list] of script.points) {
      const el = node(track);
      if (!el) continue;
      const k = toKeyframes(list, BASE[track], !NO_OPACITY.has(track));
      animate(tl, el, k.keyframes, { delay: k.delay, duration: k.duration, easing: "linear" });
    }
    const coinBody = root?.querySelector<HTMLElement>("[data-coin-body]");
    if (script.coinOpacity.length > 0 && coinBody) {
      const k = opacityKeyframes(script.coinOpacity);
      for (const leaf of Array.from(coinBody.children)) animate(tl, leaf, k.keyframes, { delay: k.delay, duration: k.duration, easing: "linear" });
    }
    for (const s of script.sounds) later(tl, s.t, () => soundRef.current && playSound(s.name, s.volume));

    // Étincelles au coup de sceau, feuilles d'or pour le gagnant d'un gros pot (moins en effets allégés)
    const layer = root?.querySelector<HTMLElement>("[data-fx]") ?? null;
    if (layer && !reduced) {
      const rand = seeded(seedOf(flipId) + 7);
      const lite = fxLevel === "lite";
      const dust = lite ? Math.ceil(fx.dust / 2) : fx.dust;
      for (let i = 0; i < dust; i++) {
        const d = document.createElement("span");
        d.className = "cf-spark";
        d.style.left = "187px";
        d.style.top = "370px";
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
              { transform: "translate(0px, 0px) scale(" + s + ")", opacity: 0 },
              { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(${s})`, opacity: 1, offset: 0.15 },
              { transform: `translate(${dx}px, ${dy + 34}px) scale(${s * 0.4})`, opacity: 0 },
            ],
            { delay: script.verdictAt + 270 + rand() * 120, duration: 650 + rand() * 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          ),
          d,
        );
      }
      if (bottomWins && fx.flakes) {
        const n = lite ? 10 : 24;
        for (let i = 0; i < n; i++) {
          const f = document.createElement("span");
          f.className = "cf-kp";
          const w = 12 + rand() * 22;
          const cell = Math.floor(rand() * 16);
          f.style.cssText = `left:${2 + rand() * 92}%;width:${w}px;height:${w}px;background-position:${(cell % 4) * 33.333}% ${Math.floor(cell / 4) * 33.333}%`;
          layer.append(f);
          const dx = (rand() - 0.5) * 100;
          const r0 = rand() * 360;
          const r1 = r0 + (rand() - 0.5) * 760;
          const fall = 780;
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
              { delay: script.verdictAt + 380 + rand() * 1000, duration: 2300 + rand() * 1500, easing: "cubic-bezier(0.3, 0.1, 0.6, 1)" },
            ),
            f,
          );
        }
      }
    }

    if (reduced) settle();
    else {
      later(tl, script.settleAt, settle);
      skipButton.current?.focus();
    }
    return () => dispose(tl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- composé une fois : la table jouée ne change plus
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pass();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pass]);

  const banner = (seat: StageSeat, place: "T" | "M") => (
    <div data-track={place === "T" ? "bannerT" : "bannerM"} className={`cf-banner ${place === "T" ? "cf-theirs" : "cf-mine"}`}>
      <span data-track={place === "T" ? "glowT" : "glowM"} className="cf-win-glow" />
      <PlayerAvatar username={seat.player.username} image={seat.player.image} size={40} frame={seat.player.decor.frame} />
      <span className="cf-who">
        <b>{seat.you ? t("you") : seat.player.username}</b>
        <small>
          {seat.card.name} · {seat.you ? t("youPlay", { side: SIDE_KANJI[seat.side] }) : t("plays", { side: SIDE_KANJI[seat.side] })}
        </small>
      </span>
      <span className="cf-side">
        <span data-track={place === "T" ? "haloT" : "haloM"} className="cf-side-glow" />
        <Image data-track={place === "T" ? "sealT" : "sealM"} src={coinImage(seat.side, true)} alt="" width={40} height={40} />
      </span>
    </div>
  );

  return (
    <div className="cf-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onPointerDown={settled ? undefined : pass}>
      <div ref={board} className="cf-board" style={{ "--cf-scale": scale } as CSSProperties}>
        <LoopBackdrop mobile={CASINO_MEDIA.room} desktop={CASINO_MEDIA.room} priority />
        <div className="cf-tshade" />
        <div data-track="dim" className="cf-dim" />
        <header className="cf-top">
          {/* Les bandeaux nomment déjà les joueurs : le titre ne sert qu'à nommer la fenêtre */}
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          <span className="flex-1" />
          <span className="cf-tier">
            <span aria-hidden="true" lang="ja" className="font-seal text-[15px]">
              {seal}
            </span>
            {tRarity(rarity as "COMMON")}
          </span>
          <button
            type="button"
            aria-pressed={soundOn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setSound(!soundOn)}
            className="cf-skip"
          >
            {soundOn ? t("soundOn") : t("soundOff")}
          </button>
          {!settled && (
            <button ref={skipButton} type="button" onClick={pass} className="cf-skip">
              {t("skip")}
            </button>
          )}
        </header>

        {banner(top, "T")}
        {banner(bottom, "M")}
        <span data-track="taisen" aria-hidden="true" lang="ja" className="cf-taisen cf-hk">
          対
        </span>

        <div className="cf-scene" aria-hidden="true">
          <div className="cf-table">
            <div className="cf-tray" />
            <div data-track="spot" className="cf-spot" />
            <div data-track="cardT" className="cf-slot cf-theirs">
              <Fuda card={top.card} size="sm" tilt={false} still />
            </div>
            <div data-track="cardM" className="cf-slot cf-mine">
              <Fuda card={bottom.card} size="sm" tilt={false} still />
            </div>
            <div data-track="coin" className="cf-coin">
              <div data-track="tilt" className="cf-coin-tilt">
                <div data-coin-body className="cf-coin-body">
                  {EDGES.map((z) => (
                    <span key={z} className="cf-edge" style={{ "--z": `${z}px` } as CSSProperties} />
                  ))}
                  <span className="cf-face cf-omote" />
                  <span className="cf-face cf-ura" />
                </div>
              </div>
            </div>
            <div data-track="flash" className="cf-flash" />
          </div>
        </div>

        <div data-fx className="cf-fx" aria-hidden="true" />
        <div className="cf-verdict" aria-hidden="true">
          <Image data-track="rays" className="cf-burst" src={CASINO_MEDIA.fx.burst} alt="" width={350} height={350} />
          <span data-track="ring" className="cf-ring" />
          <span data-track="hanko" lang="ja" className="cf-hanko cf-hk">
            {SIDE_KANJI[result]}
          </span>
        </div>

        <div data-track="outro" className="cf-outro" data-r={bottomWins ? "win" : "lose"}>
          <div data-track="ov" className="cf-ov">
            <div className="cf-okanji" aria-hidden="true">
              <span data-track="swash" className="cf-swash" />
              <span data-track="okk" lang="ja" className="cf-ok-k">
                {bottomWins ? "勝" : "負"}
              </span>
            </div>
            <b data-track="olabel" className="cf-olabel">
              {outroLabel}
            </b>
          </div>
        </div>

        <div ref={tabletRef} data-track="tablet" className="cf-tablet" aria-hidden={!settled} inert={!settled}>
          {tablet}
        </div>
        <p className="sr-only" aria-live="polite">
          {settled ? t("announce", { side: SIDE_KANJI[result], outcome: bottomWins ? t("won") : t("lost") }) : ""}
        </p>
      </div>
    </div>
  );
}
