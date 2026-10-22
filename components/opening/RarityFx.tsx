"use client";

import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BaseRarity, Rarity } from "@/lib/catalog/rarity";
import { fxTier } from "@/lib/catalog/tiers";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import "./RevealFx.css";

// Mise en scène de la révélation, par rareté (particules en CSS : transform et opacity seulement).
// Rendu au-dessus et autour de la carte qui vient de se retourner ; rien pour Commune et Peu commune.

/** Temps d'anticipation avant le retournement (ms) : plus la carte est rare, plus on retient son souffle. */
export const CHARGE_MS: Record<Rarity, number> = {
  COMMON: 0,
  UNCOMMON: 0,
  RARE: 160,
  EPIC: 480,
  LEGENDARY: 950,
  MYTHIC: 1500,
  AR: 1700,
  GOLD: 1900,
};

/** Couleur de la lumière qui s'échappe du sachet, selon la meilleure carte. */
export const LEAK_COLOR: Record<Rarity, string> = {
  COMMON: "rgb(244 237 224 / 0.55)",
  UNCOMMON: "rgb(244 237 224 / 0.7)",
  RARE: "rgb(127 163 209 / 0.85)",
  EPIC: "rgb(179 145 219 / 0.9)",
  LEGENDARY: "rgb(242 216 138 / 0.95)",
  MYTHIC: "rgb(255 236 246 / 0.95)",
  AR: "rgb(160 190 240 / 0.95)",
  GOLD: "rgb(255 226 140 / 0.98)",
};

type Ordered = readonly { key: string; sortOrder: number }[];
/** Raretés personnalisées sans réglage propre : celui de leur palier de base (fxTier). */
export const chargeFor = (rarity: Rarity, definitions: Ordered) => CHARGE_MS[rarity] ?? CHARGE_MS[fxTier(rarity, definitions)];
export const leakFor = (rarity: Rarity, definitions: Ordered) => LEAK_COLOR[rarity] ?? LEAK_COLOR[fxTier(rarity, definitions)];

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/**
 * Effet plein écran : rendu dans <body>, car la carte qui se retourne a une perspective CSS, qui
 * ferait d'un `position: fixed` une boîte de la taille de la carte (les feuilles y restaient coincées).
 */
function FullScreen({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

/** Petites valeurs pseudo-aléatoires mais stables (pas de Math.random au rendu). */
const spread = (i: number, n: number, radius: number) => {
  const a = (i / n) * Math.PI * 2 + (i % 3) * 0.35;
  const r = radius * (0.65 + ((i * 37) % 10) / 28);
  return { dx: `${Math.round(Math.cos(a) * r)}px`, dy: `${Math.round(Math.sin(a) * r)}px` };
};

export function RarityFx({ rarity, compact = false }: { rarity: Rarity; compact?: boolean }) {
  const tier = fxTier(rarity, useRarityDefinitions());
  // AR et Gold ont leur propre mise en scène ; les autres raretés suivent leur palier de base
  if (rarity === "AR") return <ArFx compact={compact} />;
  if (rarity === "GOLD") return <GoldFx compact={compact} />;
  return <TierFx rarity={tier} compact={compact} />;
}

/**
 * Reflets posés sur la carte elle-même (passés à Fuda en `overlay`) : ils suivent son inclinaison.
 * Laque : un reflet la traverse ; nacre : irisation tournante ; Gold : reflet doré qui repasse.
 */
export function RarityCardFx({ rarity }: { rarity: Rarity }) {
  const tier = fxTier(rarity, useRarityDefinitions());
  if (rarity === "GOLD") return <span aria-hidden="true" className="fx-gold-glint" />;
  if (rarity === "AR") return null;
  if (tier === "EPIC") return <span aria-hidden="true" className="fx-sheen absolute inset-0" style={v({ "--d": "0.05s" })} />;
  if (tier === "MYTHIC") return <span aria-hidden="true" className="fx-nacre absolute -inset-1/2 opacity-60" />;
  return null;
}

const AR_TINTS = ["#7fa3d1", "#d9b556", "#e0533f"] as const;

/**
 * AR 異 « Kagami » : une faille de lumière s'ouvre, des éclats prismatiques en jaillissent et un
 * kaléidoscope shu, ai et kin tourne derrière la forme alternative (les copies fantômes sont dans FlipCard).
 */
function ArFx({ compact }: { compact: boolean }) {
  const n = compact ? 8 : 18, scale = compact ? 0.55 : 1;
  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <span className="fx-ar-kaleido" />
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
        <span className="fx-ar-slit" />
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
        {Array.from({ length: n }, (_, i) => {
          const { dx, dy } = spread(i, n, 190 * scale);
          return (
            <span
              key={i}
              className="fx-ar-shard"
              style={v({ "--dx": dx, "--dy": dy, "--d": `${0.25 + (i % 5) * 0.04}s`, "--r": `${180 + i * 53}deg`, "--s": `${7 + (i % 4) * 3}px`, "--c": AR_TINTS[i % 3] })}
            />
          );
        })}
      </span>
    </>
  );
}

/**
 * Gold 煌 « Kintsugi » : flash d'or, soleil de rayons dorés et pluie de feuille d'or sur tout l'écran
 * (le reflet est dans RarityCardFx, les fissures et les éclats du dos dans FlipCard).
 */
function GoldFx({ compact }: { compact: boolean }) {
  const leaves = compact ? 0 : 26;
  return (
    <>
      {!compact && (
        <FullScreen>
          <span aria-hidden="true" className="fx-gold-flash pointer-events-none z-[60]" />
        </FullScreen>
      )}
      <span
        aria-hidden="true"
        className="light-rays pointer-events-none absolute -inset-[60%] z-0 rounded-full opacity-90"
        style={v({ "--leak": "rgb(242 216 138 / 0.6)" })}
      />
      {leaves > 0 && (
        <FullScreen>
          <span aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
            {Array.from({ length: leaves }, (_, i) => (
              <span
                key={i}
                className="fx-leaf"
                style={v({
                  "--x": `${(i * 47 + 7) % 100}%`,
                  "--dx": `${((i * 31) % 90) - 45}px`,
                  "--d": `${0.3 + (i % 9) * 0.16}s`,
                  "--t": `${2.4 + (i % 5) * 0.45}s`,
                  "--r": `${420 + i * 37}deg`,
                  "--s": `${6 + (i % 4) * 2}px`,
                })}
              />
            ))}
          </span>
        </FullScreen>
      )}
    </>
  );
}

/** Copies fantômes teintées qui convergent vers la carte AR (forme alternative). */
export function ArGhosts({ children }: { children: ReactNode }) {
  const offsets = [["-18px", "-6px"], ["16px", "10px"], ["2px", "-16px"]] as const;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      {AR_TINTS.map((tint, i) => (
        <span key={tint} className="fx-ar-ghost" style={v({ "--tint": tint, "--gx": offsets[i][0], "--gy": offsets[i][1], "--d": `${0.18 + i * 0.06}s` })}>
          {children}
        </span>
      ))}
    </span>
  );
}

/** Fissures d'or (viewBox 100 × 100, étirées sur la carte) : elles suivent les bords des éclats. */
const CRACKS = [
  "M50 0 L46 13", "M46 13 L54 23", "M54 23 L44 37", "M44 37 L30 44", "M30 44 L14 36 L0 40",
  "M44 37 L52 50", "M52 50 L70 56", "M70 56 L86 52 L100 58", "M52 50 L54 69", "M54 69 L48 86 L52 100",
  "M54 23 L68 18", "M30 44 L26 58", "M70 56 L74 70",
];
const SHARDS = [
  { clip: "polygon(0 0, 50% 0, 46% 13%, 54% 23%, 44% 37%, 30% 44%, 14% 36%, 0 40%)", sx: "-70px", sy: "-60px", sr: "-18deg" },
  { clip: "polygon(50% 0, 100% 0, 100% 58%, 86% 52%, 70% 56%, 52% 50%, 44% 37%, 54% 23%, 46% 13%)", sx: "75px", sy: "-65px", sr: "16deg" },
  { clip: "polygon(0 40%, 14% 36%, 30% 44%, 44% 37%, 52% 50%, 54% 69%, 48% 86%, 52% 100%, 0 100%)", sx: "-80px", sy: "70px", sr: "14deg" },
  { clip: "polygon(52% 50%, 70% 56%, 86% 52%, 100% 58%, 100% 100%, 52% 100%, 48% 86%, 54% 69%)", sx: "80px", sy: "80px", sr: "-20deg" },
];

/** Pendant la charge d'une Gold : les fissures d'or courent une à une sur le dos de la carte. */
export function GoldCracks({ duration }: { duration: number }) {
  const step = Math.max(0.05, (duration / 1000 - 0.3) / CRACKS.length);
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="fx-gold-cracks pointer-events-none z-30">
      {CRACKS.map((d, i) => (
        <g key={d} className="fx-crack" style={v({ "--d": `${0.1 + i * step}s` })}>
          <path d={d} className="fx-crack-glow" />
          <path d={d} />
        </g>
      ))}
    </svg>
  );
}

/** Au retournement d'une Gold : le dos fissuré se brise en quatre éclats qui s'envolent. */
export function GoldShatter({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
      {SHARDS.map((s) => (
        <span key={s.clip} className="fx-gold-shard" style={v({ "--clip": s.clip, "--sx": s.sx, "--sy": s.sy, "--sr": s.sr })}>
          {children}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="fx-gold-cracks">
            {CRACKS.map((d) => (
              <g key={d} className="fx-crack" style={{ opacity: 1, animation: "none" }}>
                <path d={d} className="fx-crack-glow" />
                <path d={d} />
              </g>
            ))}
          </svg>
        </span>
      ))}
    </span>
  );
}

function TierFx({ rarity, compact = false }: { rarity: BaseRarity; compact?: boolean }) {
  const scale = compact ? 0.55 : 1;

  if (rarity === "RARE") {
    // Indigo : trois anneaux seigaiha qui s'élargissent
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {[0, 0.16, 0.32].map((d) => (
          <span key={d} className="fx-ring aspect-square w-[90%]" style={v({ "--ring": "#7fa3d1", "--d": `${d}s` })} />
        ))}
      </span>
    );
  }

  if (rarity === "EPIC") {
    // Laque : l'encre violette éclot derrière (le reflet est dans RarityCardFx)
    return (
      <span aria-hidden="true" className="fx-ink pointer-events-none absolute -inset-[30%] z-0 rounded-full" />
    );
  }

  if (rarity === "LEGENDARY") {
    // Feuille d'or : rayons lents et éclats de kirigane
    const n = compact ? 10 : 20;
    return (
      <>
        <span
          aria-hidden="true"
          className="light-rays pointer-events-none absolute -inset-[45%] z-0 rounded-full opacity-70"
          style={v({ "--leak": "rgb(242 216 138 / 0.55)" })}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
          {Array.from({ length: n }, (_, i) => {
            const { dx, dy } = spread(i, n, 170 * scale);
            return (
              <span
                key={i}
                className="fx-flake"
                style={v({ "--dx": dx, "--dy": dy, "--d": `${(i % 5) * 0.03}s`, "--r": `${200 + i * 37}deg`, "--s": `${5 + (i % 4) * 2}px` })}
              />
            );
          })}
        </span>
      </>
    );
  }

  if (rarity === "MYTHIC") {
    // Nacre : éclat nacré, rayons pâles, irisation et pétales
    const petals = compact ? 0 : 16;
    return (
      <>
        <span aria-hidden="true" className="pointer-events-none absolute -inset-[38%] z-0">
          <span
            className="light-rays absolute inset-0 rounded-full opacity-80"
            style={v({ "--leak": "rgb(255 236 246 / 0.5)" })}
          />
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
          <span className="fx-pearl-bloom" />
        </span>
        {petals > 0 && (
          <FullScreen>
            <span aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
              {Array.from({ length: petals }, (_, i) => (
                <span
                  key={i}
                  className="fx-petal"
                  style={v({
                    "--x": `${(i * 61) % 100}%`,
                    "--dx": `${((i * 29) % 80) - 40}px`,
                    "--d": `${0.6 + (i % 8) * 0.18}s`,
                    "--t": `${2.6 + (i % 5) * 0.4}s`,
                    "--r": `${360 + i * 45}deg`,
                  })}
                />
              ))}
            </span>
          </FullScreen>
        )}
      </>
    );
  }

  return null;
}
