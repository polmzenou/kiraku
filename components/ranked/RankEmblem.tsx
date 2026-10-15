import { useId } from "react";
import { useTranslations } from "next-intl";
import type { BoardTier } from "@/lib/battle/tiers";

// Emblèmes du classé : SVG en ligne, une forme et une matière par rang (même famille que le dos de
// carte : dégradés métalliques, ensō au pinceau, initiales du rang traduit). La division s'écrit en
// traits de pinceau vermillon sous l'emblème : III (bas du rang), II, I.

type Material = { stops: string[]; edge: string; ink: string; glyph: string; glow: string };

const MATERIAL: Record<BoardTier, Material> = {
  BRONZE: { stops: ["#4a2a12", "#c98a55", "#f0c49a", "#8a5228", "#4a2a12"], edge: "#2e190a", ink: "#2e190a", glyph: "#2e190a", glow: "#cd8a55" },
  SILVER: { stops: ["#5d636a", "#e9edf1", "#a7afb8", "#f8fafc", "#5d636a"], edge: "#33383d", ink: "#2b2f34", glyph: "#1f2328", glow: "#d5dbe2" },
  GOLD: { stops: ["#7a5418", "#f9e8ad", "#c9a043", "#f2d88a", "#7a5418"], edge: "#4a3309", ink: "#4a3309", glyph: "#3b2805", glow: "#e6c35c" },
  EMERALD: { stops: ["#0c3a2a", "#4fd39d", "#1d7a57", "#a7f0cf", "#0c3a2a"], edge: "#06241a", ink: "#eafff6", glyph: "#f3ecdf", glow: "#5cc496" },
  ELITE: { stops: ["#10284a", "#7fa3d1", "#2c5a86", "#c9dcf3", "#0f213d"], edge: "#081427", ink: "#e8f0fb", glyph: "#f3ecdf", glow: "#7fa3d1" },
  CHAMPION: { stops: ["#5e0f0a", "#ff6a52", "#c8372d", "#ff9c86", "#4a0b07"], edge: "#2a0603", ink: "#ffe3dc", glyph: "#fff4ef", glow: "#e0533f" },
  GRAND_CHAMPION: {
    stops: ["#6b4f9e", "#f6f0ff", "#b7a3e0", "#ffe9f4", "#d9ccf5", "#7d63b5"],
    edge: "#3a2763",
    ink: "#4a3480",
    glyph: "#2e1f52",
    glow: "#bea8f0",
  },
};

/** Coordonnées arrondies : le serveur et le navigateur doivent écrire exactement le même SVG (hydratation). */
const round2 = (n: number) => Math.round(n * 100) / 100;

const C = 60; // centre de l'emblème (viewBox 120 × 140, la division dessous)

function polygon(n: number, r: number, rotateDeg: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rotateDeg + (360 / n) * i) * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/** Arc d'ensō (cercle au pinceau ouvert) de `from` à `to` degrés. */
function enso(r: number, from = 25, to = 335) {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${p(from)} A ${r} ${r} 0 1 1 ${p(to)}`;
}

const SHIELD = "M60 10 L102 23 V58 C102 86 84 103 60 113 C36 103 18 86 18 58 V23 Z";

/** Forme de fond de chaque rang. */
function Plate({ tier, fill, edge }: { tier: BoardTier; fill: string; edge: string }) {
  const common = { fill, stroke: edge, strokeWidth: 3, strokeLinejoin: "round" as const };
  switch (tier) {
    case "BRONZE":
      return (
        <>
          <circle cx={C} cy={C} r={50} {...common} />
          <circle cx={C} cy={C} r={42} fill="none" stroke={edge} strokeWidth={1.5} opacity={0.55} />
        </>
      );
    case "SILVER":
      return (
        <>
          <polygon points={polygon(6, 52, -90)} {...common} />
          <polygon points={polygon(6, 43, -90)} fill="none" stroke={edge} strokeWidth={1.5} opacity={0.5} />
        </>
      );
    case "GOLD":
      return (
        <>
          {/* Soleil : seize rayons derrière le disque */}
          <polygon
            points={Array.from({ length: 32 }, (_, i) => {
              const r = i % 2 === 0 ? 57 : 42;
              const a = ((-90 + (360 / 32) * i) * Math.PI) / 180;
              return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
            }).join(" ")}
            {...common}
          />
          <circle cx={C} cy={C} r={40} fill={fill} stroke={edge} strokeWidth={2} />
        </>
      );
    case "EMERALD":
      return (
        <>
          <polygon points={polygon(8, 52, -67.5)} {...common} />
          <polygon points={polygon(4, 40, -90)} fill="none" stroke={edge} strokeWidth={1.5} opacity={0.45} />
        </>
      );
    case "ELITE":
      return (
        <>
          <path d={SHIELD} {...common} />
          {/* Vagues seigaiha en bas de l'écu */}
          <g fill="none" stroke={edge} strokeWidth={1.4} opacity={0.5}>
            {[0, 1, 2].map((row) =>
              [-2, -1, 0, 1, 2].map((col) => (
                <path key={`${row}-${col}`} d={`M${C + col * 16 - 8 + (row % 2) * 8} ${92 - row * 8} a8 8 0 0 1 16 0`} />
              )),
            )}
          </g>
        </>
      );
    case "CHAMPION":
      return (
        <>
          {/* Deux sabres croisés derrière l'écu */}
          <g stroke={edge} strokeWidth={5} strokeLinecap="round">
            <line x1={14} y1={108} x2={106} y2={14} />
            <line x1={106} y1={108} x2={14} y2={14} />
          </g>
          <g stroke="#f3ecdf" strokeWidth={2} strokeLinecap="round" opacity={0.85}>
            <line x1={16} y1={106} x2={104} y2={16} />
            <line x1={104} y1={106} x2={16} y2={16} />
          </g>
          <path d={SHIELD} {...common} />
        </>
      );
    case "GRAND_CHAMPION":
      return (
        <>
          {/* Rayons, couronne et écu de nacre */}
          <g opacity={0.55}>
            {Array.from({ length: 12 }, (_, i) => (
              <line
                key={i}
                x1={C}
                y1={C}
                x2={round2(C + 66 * Math.cos(((i * 30 - 90) * Math.PI) / 180))}
                y2={round2(C + 66 * Math.sin(((i * 30 - 90) * Math.PI) / 180))}
                stroke={edge}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            ))}
          </g>
          <path d="M26 34 L36 6 L48 24 L60 0 L72 24 L84 6 L94 34 Z" {...common} />
          <path d={SHIELD} {...common} />
        </>
      );
  }
}

/**
 * Emblème d'un rang. `division` : 3 = III, 1 = I, null pour Grand Champion (ou pour n'afficher que
 * l'emblème). Décoratif par défaut : passer `label` pour qu'il soit annoncé.
 */
export function RankEmblem({
  tier,
  division = null,
  size = 64,
  label,
  className = "",
}: {
  tier: BoardTier;
  division?: 1 | 2 | 3 | null;
  size?: number;
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const t = useTranslations("ranked.tiers");
  const words = t(tier).split(" ");
  const initials = words.length > 1 ? words.map((word) => word[0]).join("") : words[0].slice(0, 2);
  const m = MATERIAL[tier];
  const grad = `rk-mat-${id}`;
  const sheen = `rk-sheen-${id}`;
  const strokes = division ?? 0; // III = 3 traits, I = 1
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`shrink-0 overflow-visible ${className}`}
      style={{ filter: `drop-shadow(0 0 ${Math.max(2, size / 14)}px ${m.glow}66)` }}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          {m.stops.map((c, i) => (
            <stop key={i} offset={i / (m.stops.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.45} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
      </defs>

      <Plate tier={tier} fill={`url(#${grad})`} edge={m.edge} />
      {/* Reflet : la moitié haute de la matière accroche la lumière */}
      <circle cx={C} cy={C - 6} r={38} fill={`url(#${sheen})`} />
      {/* Ensō au pinceau */}
      <path d={enso(30)} fill="none" stroke={m.ink} strokeWidth={4.5} strokeLinecap="round" opacity={0.8} />
      {tier === "GRAND_CHAMPION" && <path d={enso(36, 200, 520)} fill="none" stroke={m.ink} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />}
      <text
        x={C}
        y={C + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={28}
        fill={m.glyph}
        style={{ fontFamily: "var(--font-title)", fontWeight: 800 }}
      >
        {initials}
      </text>

      {/* Division : traits de pinceau vermillon */}
      {strokes > 0 && (
        <g transform={`translate(${C - (strokes - 1) * 7} 0)`}>
          {Array.from({ length: strokes }, (_, i) => (
            <path
              key={i}
              d={`M${i * 14} 120 q 1.5 7 -0.5 15`}
              stroke="#C8372D"
              strokeWidth={6}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
