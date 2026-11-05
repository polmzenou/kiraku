import { memo } from "react";
import type { Side } from "@/lib/battle/types";

// Filament électrique rouge autour d'une équipe en synergie. Tracés en zigzag dessinés une fois pour
// toutes, jamais de filtre animé : la lueur est un trait large et pâle, et le scintillement n'anime que
// l'opacité de calques empilés, pour rester fluide sur téléphone.

const W = 220;
const H = 100;
const INSET = 4;
const STEP = 6;
const AMPLITUDE = 2.6;

/** Suite pseudo-aléatoire déterministe dans [-1, 1[ : le tracé est le même au serveur et au client. */
const wobble = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43_758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

/** Un tour du cadre en zigzag : chaque segment s'écarte du bord d'une valeur différente selon `salt`. */
function bolt(salt: number): string {
  const [x0, y0, x1, y1] = [INSET, INSET, W - INSET, H - INSET];
  const sides: [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  const points: string[] = [];
  let i = 0;
  for (const [ax, ay, bx, by] of sides) {
    const horizontal = ay === by;
    const steps = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / STEP));
    for (let s = 0; s < steps; s++, i++) {
      const u = s / steps;
      const off = wobble(i, salt) * AMPLITUDE;
      const x = ax + (bx - ax) * u + (horizontal ? 0 : off);
      const y = ay + (by - ay) * u + (horizontal ? off : 0);
      points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }
  return `M${points.join("L")}Z`;
}

const BOLTS = [bolt(1), bolt(2), bolt(3)];
const HALO = `M${INSET} ${INSET}H${W - INSET}V${H - INSET}H${INSET}Z`;

function Trace({ d, className, core = true }: { d: string; className: string; core?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {core && <path d={d} fill="none" stroke="#ffe3dc" strokeWidth="0.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/**
 * Plateau : posé en tête de `.stage-row`, donc sous les cartes qui bougent et réduit avec la rangée
 * lointaine. Toujours les 3 tracés dans le DOM : le CSS en masque 2 hors effets complets, car le niveau
 * du client peut différer de celui du rendu serveur et casserait l'hydratation.
 */
export const SynergyFilament = memo(function SynergyFilament({ side, lit }: { side: Side; lit: boolean }) {
  return (
    <li aria-hidden="true" className="stage-filament" data-synergy={side} data-lit={lit || undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="filament-halo">
        <path d={HALO} fill="none" stroke="currentColor" strokeWidth="9" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {BOLTS.map((d, i) => (
        <Trace key={i} d={d} className="filament-bolt" />
      ))}
    </li>
  );
});

/** Hors plateau (choix d'équipe, decks) : un seul tracé fixe, dans le coin d'un élément en `relative`. */
export function StaticFilament() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 text-shu">
      <Trace d={BOLTS[0]} className="size-full overflow-visible" core={false} />
    </span>
  );
}
