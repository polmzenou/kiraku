"use client";

import type { CSSProperties } from "react";
import type { BaseRarity, Rarity } from "@/lib/catalog/rarity";
import { fxTier } from "@/lib/catalog/tiers";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";

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

/** Petites valeurs pseudo-aléatoires mais stables (pas de Math.random au rendu). */
const spread = (i: number, n: number, radius: number) => {
  const a = (i / n) * Math.PI * 2 + (i % 3) * 0.35;
  const r = radius * (0.65 + ((i * 37) % 10) / 28);
  return { dx: `${Math.round(Math.cos(a) * r)}px`, dy: `${Math.round(Math.sin(a) * r)}px` };
};

export function RarityFx({ rarity, compact = false }: { rarity: Rarity; compact?: boolean }) {
  const tier = fxTier(rarity, useRarityDefinitions());
  return (
    <>
      <TierFx rarity={tier} compact={compact} />
      {rarity === "AR" && <PrismFx />}
      {rarity === "GOLD" && <GoldLeafFx compact={compact} />}
    </>
  );
}

/** AR : anneaux prismatiques shu, ai et kin autour de la forme alternative. */
function PrismFx() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {(["#7fa3d1", "#d9b556", "#e0533f"] as const).map((ring, i) => (
        <span key={ring} className="fx-ring aspect-square w-[105%]" style={v({ "--ring": ring, "--d": `${0.9 + i * 0.14}s` })} />
      ))}
    </span>
  );
}

/** Gold : pluie d'éclats de feuille d'or autour de la carte. */
function GoldLeafFx({ compact }: { compact: boolean }) {
  const n = compact ? 14 : 32, scale = compact ? 0.55 : 1;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
      {Array.from({ length: n }, (_, i) => {
        const { dx, dy } = spread(i, n, 210 * scale);
        return <span key={i} className="fx-flake" style={v({ "--dx": dx, "--dy": dy, "--d": `${0.8 + (i % 6) * 0.05}s`, "--r": `${160 + i * 41}deg`, "--s": `${6 + (i % 4) * 2}px` })} />;
      })}
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
    // Laque : un reflet traverse la carte, l'encre violette éclot derrière
    return (
      <>
        <span aria-hidden="true" className="fx-ink pointer-events-none absolute -inset-[30%] z-0 rounded-full" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[6px]">
          <span className="fx-sheen absolute inset-0" style={v({ "--d": "0.05s" })} />
        </span>
      </>
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
    // Nacre : ensō vermillon qui se referme derrière la carte, sceau 神, onde de choc, irisation, pétales
    const petals = compact ? 0 : 16;
    return (
      <>
        <span aria-hidden="true" className="pointer-events-none absolute -inset-[38%] z-0">
          <span
            className="light-rays absolute inset-0 rounded-full opacity-80"
            style={v({ "--leak": "rgb(255 236 246 / 0.5)" })}
          />
          <EnsoDraw />
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[6px] opacity-60">
          <span className="fx-nacre absolute -inset-1/2" />
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
          {[0.55, 0.75].map((d) => (
            <span key={d} className="fx-ring aspect-square w-[120%]" style={v({ "--ring": "#e0533f", "--d": `${d}s` })} />
          ))}
        </span>
        {petals > 0 && (
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
        )}
      </>
    );
  }

  return null;
}

/**
 * Ensō qui se trace en 0,7 s, comme l'ensō du stock : chaque moitié est un anneau masqué sur la
 * moitié opposée qui tourne de 180° pour entrer dans sa moitié visible (transform seulement).
 */
function EnsoDraw() {
  const ring = "absolute inset-0 rounded-full border-[12px] border-shu shadow-[0_0_18px_rgb(224_83_63/0.55)]";
  return (
    <span className="absolute inset-[6%]">
      <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
        <span className={`${ring} [clip-path:inset(0_50%_0_0)]`} style={{ animation: "enso-sweep 0.35s ease-in forwards" }} />
      </span>
      <span className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
        <span
          className={`${ring} [clip-path:inset(0_0_0_50%)]`}
          style={{ transform: "rotate(0deg)", animation: "enso-sweep 0.35s ease-out 0.35s forwards" }}
        />
      </span>
    </span>
  );
}
