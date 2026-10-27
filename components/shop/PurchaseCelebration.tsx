"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { BoosterArt } from "../boosters/BoosterArt";
import { ZeniCoin } from "../layout/ZeniCoin";
import { useFxLevel } from "../motion/MotionPreference";
import { useRitualFx } from "../opening/useRitualFx";
import { SealMark } from "../SealMark";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import "./celebration/celebration.css";
import { runHanabi } from "./celebration/hanabi";
import { runOffering, type RunOptions } from "./celebration/offering";
import { createTimeline, dispose, skip, type Timeline } from "./celebration/timeline";
import type { Celebration } from "./ShopStage";

/** Sachets dessinés au plus : au-delà, un « ×N » (le pack ×10 doit tenir en 375 px). */
const MAX_SHOWN = 5;
/** Défilement du solde vers la valeur renvoyée par le serveur. */
const COUNT_MS = 650;

/**
 * Célébration d'un achat de boosters, dans un <dialog> natif (focus piégé, Échap, et la modale d'annonce
 * attend qu'il soit fermé). Achat courant : 賽銭 l'offrande. Grand format (×10, Jūbako) : 花火 le feu
 * d'artifice en grand final. Moins de 2,5 s ; un appui n'importe où passe à la fin. Le nombre de boosters
 * et le solde sont ceux de la réponse du serveur, le sachet vient de l'article.
 */
export function PurchaseCelebration({ reward, coins, spent, look, name, openHref, onClose }: Celebration & { onClose: () => void }) {
  const t = useTranslations("economy.shop.celebration");
  const ts = useTranslations("economy.shop");
  const level = useFxLevel();
  const fx = useRitualFx();
  const play = useRef(fx.play);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const fxLayer = useRef<HTMLDivElement>(null);
  const fan = useRef<(HTMLDivElement | null)[]>([]);
  const badge = useRef<HTMLSpanElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const result = useRef<HTMLDivElement>(null);
  // Décor des scènes : l'offrande (nuit, rayons, colonne, cloche, boîte) ou le feu d'artifice (pack au sol)
  const dim = useRef<HTMLSpanElement>(null);
  const rays = useRef<HTMLSpanElement>(null);
  const pillar = useRef<HTMLSpanElement>(null);
  const rope = useRef<HTMLSpanElement>(null);
  const bell = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const boxGlow = useRef<HTMLSpanElement>(null);
  const pack = useRef<HTMLSpanElement>(null);
  const packGlow = useRef<HTMLSpanElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const titleId = useId();
  const descId = useId();

  // Solde avant l'achat (le lot a pu rendre des Zeni) : il défile jusqu'au solde du serveur
  const before = coins + spent - reward.zeni;
  const [balance, setBalance] = useState(before);
  const [done, setDone] = useState(false);
  const grand = reward.boosters >= 10 || look?.shape === "JUBAKO";
  const shown = Math.min(MAX_SHOWN, Math.max(1, reward.boosters));
  // Figé au montage : le déroulé ne se relance pas si le niveau d'effets change en cours de route
  const setup = useRef({ grand, level, total: reward.boosters, coins, before, base: look?.theme.base ?? "#c8372d" });

  useEffect(() => {
    play.current = fx.play;
  });

  useEffect(() => {
    const s = setup.current;
    dialog.current?.showModal();
    title.current?.focus({ preventScroll: true });
    const tl = createTimeline(s.level === "reduced");
    timeline.current = tl;
    let alive = true;
    let frame = 0;

    const countBalance = () => {
      const start = performance.now();
      const tick = (now: number) => {
        if (!alive) return;
        const p = tl.skipped ? 1 : Math.min(1, (now - start) / COUNT_MS);
        setBalance(Math.round(s.before + (s.coins - s.before) * (1 - (1 - p) ** 3)));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const options: RunOptions = {
      total: s.total,
      lite: s.level === "lite",
      play: (name, haptic) => play.current(name, haptic),
      onResult: countBalance,
    };
    const nodes = {
      world: world.current!,
      fx: fxLayer.current!,
      fan: fan.current.filter((n): n is HTMLDivElement => n !== null),
      badge: badge.current,
      stamp: stamp.current!,
      result: result.current!,
    };
    const run = s.grand
      ? runHanabi(
          tl,
          { ...nodes, pack: pack.current!, packGlow: packGlow.current!, colors: { base: s.base, light: `color-mix(in oklab, ${s.base} 50%, white)` } },
          options,
        )
      : runOffering(
          tl,
          {
            ...nodes,
            dim: dim.current!,
            rays: rays.current!,
            pillar: pillar.current!,
            rope: rope.current!,
            bell: bell.current!,
            box: box.current!,
            boxGlow: boxGlow.current!,
          },
          options,
        );
    run.then(() => {
      if (alive) setDone(true);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      dispose(tl);
    };
  }, []);

  // Les boutons arrivent en dernier : le focus passe du titre au premier d'entre eux
  useEffect(() => {
    if (done && document.activeElement === title.current) {
      actions.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    }
  }, [done]);

  if (!look) return null;
  const skipNow = () => {
    if (timeline.current) skip(timeline.current);
  };
  const art = () => <BoosterArt shape={look.shape} theme={look.theme} emblem={look.emblem} name={name} contents={look.contents} compact flatShadow />;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onClose}
      onClick={(e) => {
        if (!done && !(e.target as Element).closest("a, button")) skipNow();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-washi-paper backdrop:bg-black/85"
    >
      <div ref={world} aria-hidden="true" className="cel-world">
        {grand ? (
          <>
            <span className="cel-sky">
              <span className="cel-twinkle" />
            </span>
            <span className="cel-horizon" />
            <span ref={packGlow} className="cel-pack-glow" style={{ "--glow": `color-mix(in oklab, ${look.theme.base} 60%, white)` } as CSSProperties} />
            <span ref={pack} className="cel-pack">
              {art()}
            </span>
          </>
        ) : (
          <>
            <span ref={dim} className="cel-dim" />
            <span ref={rays} className="cel-rays" />
            <span ref={pillar} className="cel-pillar" />
            <span ref={rope} className="cel-rope">
              <span ref={bell} className="cel-bell" />
            </span>
            <span ref={box} className="cel-box">
              <span ref={boxGlow} className="cel-box-glow" />
              <span className="cel-box-lid" />
              <span lang="ja" className="cel-box-front font-seal">
                銭
              </span>
            </span>
          </>
        )}
        <div ref={fxLayer} className="cel-fx" />
        {Array.from({ length: shown }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              fan.current[i] = el;
            }}
            className="cel-sachet"
          >
            {art()}
          </div>
        ))}
        {reward.boosters > shown && (
          <span ref={badge} className="cel-badge">
            {ts("quantity", { count: reward.boosters })}
          </span>
        )}
        <span ref={stamp} className="cel-stamp">
          <SealMark glyphs="済" size={76} />
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div ref={result} className="cel-result flex flex-col items-center gap-1 text-center">
          <h2 ref={title} id={titleId} tabIndex={-1} className="font-heading text-2xl outline-none sm:text-3xl">
            {t("title")}
          </h2>
          <p id={descId} className="text-base font-bold text-kin">
            {t("boosters", { count: reward.boosters, name })}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-washi-paper/75 tabular-nums">
            <span>{t("spent", { amount: spent })}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <ZeniCoin size={14} />
              <span className="sr-only">{t("balance", { amount: coins })}</span>
              <span aria-hidden="true">{t("balance", { amount: balance })}</span>
            </span>
          </p>
        </div>
        <div
          ref={actions}
          inert={!done}
          className={`flex flex-wrap justify-center gap-2 transition-opacity duration-300 motion-reduce:transition-none ${done ? "opacity-100" : "opacity-0"}`}
        >
          {openHref && (
            <ButtonLink href={openHref} variant="primary" size="lg">
              {t("open")}
            </ButtonLink>
          )}
          <Button type="button" size="lg" onClick={() => dialog.current?.close()}>
            {t("continue")}
          </Button>
        </div>
      </div>

      {!done && (
        <button
          type="button"
          onClick={skipNow}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 inline-flex min-h-11 items-center rounded-pill border border-white/25 bg-black/40 px-4 text-sm font-bold text-washi-paper"
        >
          {t("skip")}
        </button>
      )}
    </dialog>
  );
}
