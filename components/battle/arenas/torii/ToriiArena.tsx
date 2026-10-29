"use client";

import { useId, useRef } from "react";
import { moteStyle, particles, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./torii.css";

// Le Sanctuaire aux mille torii (千本鳥居), arène du palier Or : un tunnel de torii vermillon au
// couchant. Les portiques sont calculés en perspective (point de fuite au fond du chemin) et pâlissent
// avec la distance ; lanternes de pierre, renards de pierre et érables sont dessinés pour Kiraku.

const VP = { x: 600, y: 250 };
const GATES = Array.from({ length: 11 }, (_, i) => 10 - i); // du plus lointain au plus proche
const scaleAt = (depth: number) => 1 / (1 + depth * 0.42);
const groundAt = (s: number) => VP.y + 560 * s;

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Un torii (kasagi recourbé, shimaki, nuki, piliers et socles noirs) à la profondeur donnée. */
function Gate({ depth }: { depth: number }) {
  const s = scaleAt(depth);
  const haze = Math.min(1, depth / 10) * 0.78;
  const shu = mix("#c23126", "#d9a273", haze);
  const shade = mix("#7d1a14", "#c98d62", haze);
  const ink = mix("#1b1210", "#9b6a5a", haze);
  const yG = groundAt(s);
  const half = 330 * s;
  const top = yG - 640 * s;
  const pw = 36 * s;
  const kw = half * 2.62;
  const kt = 30 * s;
  const pillar = (cx: number) => (
    <>
      <rect x={cx - pw / 2} y={top + 36 * s} width={pw} height={yG - top - 36 * s} fill={shu} />
      <rect x={cx + (cx < 600 ? pw * 0.12 : -pw * 0.47)} y={top + 36 * s} width={pw * 0.35} height={yG - top - 36 * s} fill={shade} opacity=".55" />
      <rect x={cx - pw * 0.66} y={yG - 54 * s} width={pw * 1.32} height={54 * s} fill={ink} />
    </>
  );
  return (
    <g>
      {pillar(600 - half)}
      {pillar(600 + half)}
      <rect x={600 - half - pw * 1.5} y={top + 150 * s} width={half * 2 + pw * 3} height={20 * s} fill={shu} />
      <rect x={600 - half - pw * 1.5} y={top + 166 * s} width={half * 2 + pw * 3} height={4 * s} fill={shade} opacity=".7" />
      <rect x={600 - 9 * s} y={top + 52 * s} width={18 * s} height={100 * s} fill={shu} />
      <rect x={600 - half * 1.17} y={top + kt * 1.05} width={half * 2.34} height={17 * s} fill={shu} />
      <path
        d={`M${600 - kw / 2} ${top - 2 * s}Q600 ${top + kt * 1.1} ${600 + kw / 2} ${top - 2 * s}L${600 + kw / 2 - 10 * s} ${top + kt * 0.95}Q600 ${top + kt * 2} ${600 - kw / 2 + 10 * s} ${top + kt * 0.95}Z`}
        fill={ink}
      />
    </g>
  );
}

/** Lanterne de pierre (tōrō) : socle, fût, plateau, boîte à lumière, toit recourbé et hōju. */
function Toro({ x, y, s }: { x: number; y: number; s: number }) {
  const w = 70 * s;
  return (
    <g>
      <rect x={x - w * 0.6} y={y - 18 * s} width={w * 1.2} height={18 * s} fill="#5e5852" />
      <rect x={x - w * 0.18} y={y - 120 * s} width={w * 0.36} height={102 * s} fill="#77706a" />
      <rect x={x - w * 0.5} y={y - 136 * s} width={w} height={16 * s} fill="#6a635d" />
      <rect x={x - w * 0.36} y={y - 192 * s} width={w * 0.72} height={56 * s} fill="#5e5852" />
      <rect x={x - w * 0.2} y={y - 182 * s} width={w * 0.4} height={36 * s} fill="#ffd9a0" />
      <path d={`M${x - w * 0.82} ${y - 190 * s}Q${x} ${y - 214 * s} ${x + w * 0.82} ${y - 190 * s}L${x + w * 0.5} ${y - 222 * s}H${x - w * 0.5}Z`} fill="#4a4540" />
      <path d={`M${x} ${y - 246 * s}c${8 * s} ${6 * s} ${10 * s} ${14 * s} 0 ${22 * s}c${-10 * s} ${-8 * s} ${-8 * s} ${-16 * s} 0 ${-22 * s}z`} fill="#4a4540" />
    </g>
  );
}

const TOROS = [1.6, 3.7, 6.4].map((d) => {
  const s = scaleAt(d);
  return { s, y: groundAt(s), dx: 330 * s + 86 * s };
});

export function ToriiArena({ level, handleRef }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const rays = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLDivElement>(null);
  const lamps = useRef<HTMLDivElement>(null);
  const flare = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.3 },
      { ref: edges, depth: 1.5 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "turn":
          pulse(bell.current, [{ transform: "rotate(0deg)" }, { transform: "rotate(11deg)", offset: 0.18 }, { transform: "rotate(-8deg)", offset: 0.42 }, { transform: "rotate(4deg)", offset: 0.66 }, { transform: "rotate(0deg)" }], { duration: 1_500, easing: "ease-in-out" });
          break;
        case "crit":
        case "ko":
          shower(fx.current, "tr-gust", particles(level, 18), { from: [0.1, 0.9], y0: 0.2, fall: 0.5, drift: 0.7, duration: 1_500, spin: 540 });
          pulse(rays.current, [{ opacity: 0.55 }, { opacity: 1, offset: 0.25 }, { opacity: 0.55 }], { duration: 1_100 });
          if (reaction === "ko") edges.current?.querySelectorAll(".tr-eyes i").forEach((e) => pulse(e, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1_800 }));
          break;
        case "technique":
          lamps.current?.querySelectorAll("i").forEach((l, i) => pulse(l, [{ opacity: 0.7 }, { opacity: 1, offset: 0.3 }, { opacity: 0.7 }], { duration: 900, delay: i * 60, composite: "replace" }));
          pulse(flare.current, [{ opacity: 0 }, { opacity: 0.45, offset: 0.3 }, { opacity: 0 }], { duration: 900 });
          break;
        case "victory":
          pulse(flare.current, [{ opacity: 0 }, { opacity: 0.75, offset: 0.3 }, { opacity: 0.3 }], { duration: 1_800, fill: "forwards" });
          shower(fx.current, "tr-gust", particles(level, 40), { from: [0, 1], y0: -0.05, fall: 1.05, drift: 0.3, duration: 3_600, spin: 720 });
          break;
        case "defeat":
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 1_400, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const leaves = particles(level, 16);

  return (
    <div className="arena arena-torii" data-level={level}>
      <div ref={far} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#120f24" />
              <stop offset=".14" stopColor="#3a1a3a" />
              <stop offset=".24" stopColor="#8f2a2a" />
              <stop offset=".3" stopColor="#d9a24a" />
              <stop offset=".34" stopColor="#f2d88a" />
            </linearGradient>
            <radialGradient id={`${u}-sun`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#fffaf0" />
              <stop offset=".25" stopColor="#fff1c4" />
              <stop offset=".6" stopColor="#f2d88a" stopOpacity=".5" />
              <stop offset="1" stopColor="#f2d88a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${u}-path`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c9a87a" />
              <stop offset=".3" stopColor="#8a7258" />
              <stop offset="1" stopColor="#4a3c30" />
            </linearGradient>
            <linearGradient id={`${u}-ground`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5a3f2e" />
              <stop offset=".4" stopColor="#3a2a22" />
              <stop offset="1" stopColor="#1e1612" />
            </linearGradient>
          </defs>
          <rect width="1200" height="900" fill={`url(#${u}-sky)`} />
          <circle cx={VP.x} cy={VP.y - 6} r="120" fill={`url(#${u}-sun)`} />
          <path d="M0 262L120 214L220 236L330 196L430 232L520 220L560 252H0Z" fill="#2a1830" opacity=".8" />
          <path d="M1200 262L1080 210L980 236L880 200L780 236L690 222L640 252H1200Z" fill="#2a1830" opacity=".8" />
          {/* Sol de gravier et chemin dallé vers le fond */}
          <path d={`M0 ${VP.y}H1200V900H0Z`} fill={`url(#${u}-ground)`} />
          <path d={`M${VP.x - 14} ${VP.y}H${VP.x + 14}L${VP.x + 430} 900H${VP.x - 430}Z`} fill={`url(#${u}-path)`} />
          {GATES.map((d) => {
            const s = scaleAt(d);
            const y = groundAt(s);
            const half = 400 * s;
            return <path key={`seam-${d}`} d={`M${VP.x - half * 0.98} ${y}H${VP.x + half * 0.98}`} stroke="#3a2e24" strokeWidth={Math.max(1, 4 * s)} opacity=".55" />;
          })}
          <path d={`M${VP.x} ${VP.y}L${VP.x} 900`} stroke="#3a2e24" strokeWidth="3" opacity=".35" />
          {/* Lanternes de pierre de part et d'autre */}
          {TOROS.slice()
            .reverse()
            .map((t, i) => (
              <g key={i}>
                <Toro x={VP.x - t.dx} y={t.y} s={t.s} />
                <Toro x={VP.x + t.dx} y={t.y} s={t.s} />
              </g>
            ))}
          {/* Le tunnel de torii */}
          {GATES.map((d) => (
            <Gate key={d} depth={d} />
          ))}
        </svg>
      </div>

      {/* Rayons du couchant qui tournent lentement au fond du tunnel */}
      <div ref={rays} className="arena-prop tr-rays" style={{ ["--px" as string]: VP.x - 700, ["--py" as string]: VP.y - 700, ["--pw" as string]: 1400, ["--ph" as string]: 1400 }} />

      {/* Lueur des lanternes */}
      <div ref={lamps} className="tr-lamps" aria-hidden="true">
        {TOROS.flatMap((t, i) =>
          [-1, 1].map((side) => (
            <i
              key={`${i}-${side}`}
              className="arena-prop tr-lamp"
              style={{
                ["--px" as string]: VP.x + side * t.dx - 90 * t.s,
                ["--py" as string]: t.y - 254 * t.s,
                ["--pw" as string]: 180 * t.s,
                ["--ph" as string]: 180 * t.s,
                animationDelay: `${-i * 1.3 - (side + 1) * 0.4}s`,
              }}
            />
          )),
        )}
      </div>

      {/* Feuilles d'érable qui tombent */}
      <div className="tr-leaves" aria-hidden="true">
        {Array.from({ length: leaves }, (_, i) => (
          <span key={i} className="tr-leaf" data-tone={i % 3} style={moteStyle(i, 9, { x: [0, 100], y: [-10, -2] }, [9, 16], [12, 20])} />
        ))}
      </div>

      {/* Abords : branches d'érable, grelot du sanctuaire, renards de pierre */}
      <div ref={edges} className="arena-edges">
        {["l", "r"].map((side) => (
          <svg key={side} className={`tr-branch tr-branch-${side}`} viewBox="0 0 300 200" aria-hidden="true">
            <path d="M0 30C60 40 110 70 150 110C180 140 220 150 270 146" stroke="#2a1a14" strokeWidth="9" fill="none" strokeLinecap="round" />
            <path d="M90 62C110 40 140 34 170 38M150 110C170 90 200 84 230 92" stroke="#2a1a14" strokeWidth="5" fill="none" strokeLinecap="round" />
            {[
              [40, 40, 0],
              [80, 60, 1],
              [120, 44, 2],
              [160, 38, 0],
              [140, 100, 1],
              [190, 96, 2],
              [230, 90, 0],
              [250, 140, 1],
              [200, 150, 2],
              [100, 84, 0],
              [60, 24, 2],
              [180, 70, 1],
            ].map(([x, y, tone], i) => (
              <path
                key={i}
                transform={`translate(${x} ${y}) rotate(${i * 37}) scale(${0.9 + (i % 3) * 0.15})`}
                d="M0-16l4 9 9-5-3 10 10 2-9 6 5 8-9-2-1 10-6-8-6 8-1-10-9 2 5-8-9-6 10-2-3-10 9 5z"
                fill={["#c8372d", "#e0533f", "#8e2018"][tone]}
              />
            ))}
          </svg>
        ))}
        <div ref={bell} className="tr-suzu">
          <svg viewBox="0 0 60 260" aria-hidden="true">
            <path d="M22 0C26 40 34 70 30 110C26 150 34 180 30 214" stroke="#c8372d" strokeWidth="12" fill="none" strokeLinecap="round" />
            <path d="M22 0C26 40 34 70 30 110C26 150 34 180 30 214" stroke="#f3ecdf" strokeWidth="12" fill="none" strokeDasharray="6 10" strokeLinecap="round" />
            <circle cx="30" cy="232" r="22" fill="#d9b556" />
            <circle cx="30" cy="232" r="22" fill="none" stroke="#8a6a1f" strokeWidth="3" />
            <path d="M14 238H46" stroke="#7a5418" strokeWidth="3" />
            <circle cx="24" cy="224" r="5" fill="#fff1c4" opacity=".8" />
          </svg>
        </div>
        {["l", "r"].map((side) => (
          <div key={side} className={`tr-kitsune tr-kitsune-${side}`}>
            <svg viewBox="0 0 160 240" aria-hidden="true">
              <rect x="8" y="196" width="144" height="44" fill="#4f4a45" />
              <rect x="20" y="186" width="120" height="14" fill="#67615b" />
              <path d="M112 186c30-20 34-66 10-92-6 22-14 40-26 52z" fill="#8b8378" />
              <path d="M44 186c-4-34 4-62 18-80-8-20-6-44 6-60l14 26c6-2 12-2 18 0l14-26c12 16 14 40 6 60 14 18 22 46 18 80z" fill="#9a9288" />
              <path d="M62 106c12-10 36-10 48 0" stroke="#6f685f" strokeWidth="3" fill="none" />
              <path d="M52 112c12 18 56 18 68 0l-6 26c-14 10-42 10-56 0z" fill="#c8372d" />
              <path d="M70 76l6 4M96 80l6-4" stroke="#3a3530" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <div className="tr-eyes">
              <i style={{ left: "44%", top: "32%" }} />
              <i style={{ left: "60%", top: "32%" }} />
            </div>
          </div>
        ))}
      </div>

      <div ref={flare} className="tr-flare" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
    </div>
  );
}
