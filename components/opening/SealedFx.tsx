"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { ApocalypseOutcome, SealedKind } from "@/lib/boosters/draw";
import type { SealedDisplay } from "@/lib/boosters/view";
import { BoosterArt } from "../boosters/BoosterArt";
import "./SealedFx.css";

const v = (vars: Record<string, string>) => vars as CSSProperties;

/** Fissures de l'Apocalyptique, révélées une à une (positions fixes, en pourcentage du sachet). */
const CRACKS = [
  "M50 4 L46 22 L54 34 L44 52",
  "M44 52 L30 60 L22 78",
  "M44 52 L58 66 L52 84 L60 98",
  "M54 34 L72 40 L84 32",
  "M30 60 L12 58",
];

/**
 * Le booster qu'on vient de déchirer s'est transformé : sachet scellé au centre, rayons (Divin) ou
 * nuit rougeoyante et fissures (Apocalyptique), titre, puis les actions (`children`).
 * Environ 1,2 s avant les actions ; figé à sa dernière image si le mouvement est réduit.
 */
export function SealedTransform({
  display,
  more,
  lite,
  reduced,
  children,
}: {
  display: SealedDisplay;
  /** Autres sachets tombés dans la même ouverture. */
  more: number;
  lite: boolean;
  reduced: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("sealed");
  const { kind } = display;
  return (
    <section aria-labelledby="sealed-transform-title" className="relative flex w-full flex-col items-center gap-5 py-4" data-kind={kind}>
      {!reduced && (
        <div aria-hidden="true" className="sealed-backdrop" data-kind={kind}>
          <span className="sealed-glow" />
          {kind === "divin" && !lite && <span className="sealed-rays" />}
        </div>
      )}
      <div className="sealed-art relative z-10 w-[min(13rem,52vw)]" data-kind={kind} aria-hidden="true">
        <BoosterArt
          shape={display.shape}
          theme={display.theme}
          emblem={display.emblem}
          name={display.name}
          contents={display.contents}
          overlay={
            kind === "apocalypse" ? (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
                {CRACKS.map((d, i) => (
                  <path
                    key={d}
                    d={d}
                    className="sealed-crack"
                    style={v({ "--d": `${0.75 + i * 0.12}s` })}
                    fill="none"
                    stroke="#E0533F"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            ) : null
          }
        />
      </div>
      <div className="sealed-title relative z-10 flex flex-col items-center gap-1 text-center">
        <h2 id="sealed-transform-title" className="font-heading text-3xl font-extrabold tracking-wide uppercase sm:text-4xl">
          {t(kind === "divin" ? "transformDivin" : "transformApocalypse")}
        </h2>
        <p className="text-sm text-text-muted">{display.tagline}</p>
        {more > 0 && <p className="text-sm font-bold text-kin">{t("transformMore", { count: more })}</p>}
      </div>
      <div className="sealed-actions relative z-10 flex w-full max-w-sm flex-col gap-2">{children}</div>
    </section>
  );
}

const ASHES = 12;
const LITE_ASHES = 5;

/**
 * Ouverture d'un Apocalyptique, avant la révélation des cartes : le sceau 滅 se fend en deux, puis de
 * l'or passe par la fente (épargné) ou des cendres tombent (ruiné). L'issue vient du serveur ;
 * `onDone` passe à la pile de cartes (aussitôt en mouvement réduit, après une courte lecture).
 */
export function ApocalypseOmen({
  outcome,
  lite,
  reduced,
  onDone,
}: {
  outcome: ApocalypseOutcome;
  lite: boolean;
  reduced: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("sealed");
  // Le délai ne repart pas à chaque rendu du parent : seul le dernier `onDone` est appelé
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const id = setTimeout(() => done.current(), reduced ? 1200 : 2600);
    return () => clearTimeout(id);
  }, [reduced]);
  const spared = outcome === "SPARED";
  return (
    <div className="omen" data-outcome={outcome} role="status" aria-live="assertive">
      <div className="omen-seal" aria-hidden="true">
        {spared && !reduced && <span className="omen-light" />}
        {(["left", "right"] as const).map((side) => (
          <span key={side} className="omen-half" data-side={side}>
            <span lang="ja" className="font-seal text-[min(9rem,34vw)] leading-none">
              滅
            </span>
          </span>
        ))}
      </div>
      {!spared &&
        !reduced &&
        Array.from({ length: lite ? LITE_ASHES : ASHES }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="omen-ash"
            style={v({
              "--x": `${30 + ((i * 37) % 40)}%`,
              "--dx": `${((i * 23) % 50) - 25}px`,
              "--s": `${4 + (i % 3) * 2}px`,
              "--d": `${1 + (i % 6) * 0.08}s`,
              "--t": `${1.3 + (i % 4) * 0.25}s`,
              "--r": `${(i % 2 ? 1 : -1) * (90 + i * 13)}deg`,
            })}
          />
        ))}
      <p className={`omen-word font-heading text-2xl font-extrabold tracking-widest uppercase ${spared ? "text-kin" : "text-text-muted"}`}>
        {t(spared ? "spared" : "ruined")}
      </p>
    </div>
  );
}

/** Kanji et libellé d'un sachet scellé (badges du récap). */
export function sealedGlyph(kind: SealedKind): string {
  return kind === "divin" ? "天" : "滅";
}
