import type { CSSProperties } from "react";
import "./prestige.css";

// Aura du profil d'un joueur au prestige 1 ou plus : de la poudre d'or qui monte derrière l'en-tête dès le prestige I,
// plus dense à chaque palier, et les nuées d'or qui dérivent à partir du V (deux bandes, trois à partir du X).
// Purement décorative.

/** Bande de nuées (lobes en arcs), raccord parfait aux deux bords pour défiler sans couture. */
function cloudBand(fill: string, stroke: string): string {
  const pts: [number, number][] = [[0, 70], [62, 46], [150, 28], [236, 44], [300, 74], [362, 56], [446, 30], [532, 46], [600, 70]];
  let d = "M0 70";
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const r = (Math.hypot(x1 - x0, y1 - y0) * 0.62).toFixed(1);
    d += `A${r} ${r} 0 0 1 ${x1} ${y1}`;
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 130' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0' stop-color='${fill}'/><stop offset='1' stop-color='${fill}' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='${d}L600 130L0 130Z' fill='url(#g)'/><path d='${d}' fill='none' stroke='${stroke}' stroke-width='2'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const BANDS = [
  { top: "5.5rem", height: "7.5rem", opacity: 0.5, d: "70s", reverse: false, image: cloudBand("#d9b556", "#f6e3a1") },
  { top: "2rem", height: "6rem", opacity: 0.34, d: "110s", reverse: true, image: cloudBand("#b08a2e", "#e8cb75") },
  { top: "-0.5rem", height: "5rem", opacity: 0.26, d: "150s", reverse: false, image: cloudBand("#f3dc8c", "#fff3c4") },
];

/** Paillettes de poudre d'or : 16 au prestige I, 24 au V, 32 au X, 40 au XVIII. */
const SPECKS = Array.from({ length: 40 }, (_, i) => ({
  left: `${((i * 61.8) % 100).toFixed(1)}%`,
  size: 2 + (i % 3),
  d: `${(5 + (i % 5) * 1.3).toFixed(1)}s`,
  delay: `${(-((i * 0.77) % 7)).toFixed(2)}s`,
  dx: `${((i % 7) - 3) * 9}px`,
}));

export function PrestigeAura({ prestige }: { prestige: number }) {
  if (prestige < 1) return null;
  const bands = prestige >= 10 ? 3 : prestige >= 5 ? 2 : 0;
  const specks = prestige >= 18 ? 40 : prestige >= 10 ? 32 : prestige >= 5 ? 24 : 16;
  return (
    <div className="pr-aura" aria-hidden="true">
      {BANDS.slice(0, bands).map((b, i) => (
        <span
          key={i}
          className="pr-nuee"
          style={{ top: b.top, height: b.height, opacity: b.opacity, backgroundImage: b.image, animationDirection: b.reverse ? "reverse" : undefined, "--pr-d": b.d } as CSSProperties}
        />
      ))}
      {SPECKS.slice(0, specks).map((s, i) => (
        <span
          key={`s${i}`}
          className="pr-speck"
          style={{ left: s.left, width: s.size, height: s.size, "--pr-d": s.d, "--pr-delay": s.delay, "--pr-dx": s.dx } as CSSProperties}
        />
      ))}
    </div>
  );
}
