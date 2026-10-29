"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { Grain, Haze, moteStyle, OrganicDefs, particles, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
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

/**
 * Un torii (kasagi recourbé, shimaki, nuki, piliers et socles noirs) à la profondeur donnée. Chaque
 * portique a ses défauts : légère gîte, peinture usée par plaques, pied assombri, mousse au socle.
 */
function Gate({ depth }: { depth: number }) {
  const s = scaleAt(depth);
  const j = (salt: number) => noise(depth + 1, salt) - 0.5;
  const haze = Math.min(1, depth / 10) * 0.78;
  const shu = mix("#c23126", "#d9a273", haze);
  const shade = mix("#7d1a14", "#c98d62", haze);
  const worn = mix("#e07a5a", "#e8c0a0", haze);
  const ink = mix("#1b1210", "#9b6a5a", haze);
  const moss = mix("#2f3a22", "#7a7a5a", haze);
  const yG = groundAt(s);
  const half = 330 * s * (1 + j(7) * 0.02);
  const top = yG - 640 * s * (1 + j(9) * 0.025);
  const pw = 36 * s;
  const kw = half * 2.62;
  const kt = 30 * s;
  const pillar = (cx: number, side: number) => {
    const y0 = top + 36 * s;
    return (
      <>
        <path d={`M${cx - pw / 2} ${y0}H${cx + pw / 2}L${cx + pw * 0.56} ${yG}H${cx - pw * 0.56}Z`} fill={shu} />
        <path d={`M${cx + (cx < 600 ? pw * 0.1 : -pw * 0.46)} ${y0}h${pw * 0.36}l${pw * 0.03} ${yG - y0}h${-pw * 0.4}Z`} fill={shade} opacity=".55" />
        {[0, 1, 2].map((k) => (
          <rect
            key={k}
            x={cx - pw * (0.3 - noise(depth * 3 + side + k, 13) * 0.4)}
            y={y0 + (yG - y0) * (0.12 + noise(depth * 3 + side + k, 17) * 0.7)}
            width={pw * (0.18 + noise(depth + k, 19) * 0.22)}
            height={(yG - y0) * (0.03 + noise(depth + k, 23) * 0.05)}
            rx={pw * 0.08}
            fill={worn}
            opacity=".32"
          />
        ))}
        <rect x={cx - pw * 0.56} y={yG - 150 * s} width={pw * 1.12} height={96 * s} fill={ink} opacity=".22" />
        <rect x={cx - pw * 0.66} y={yG - 54 * s} width={pw * 1.32} height={54 * s} fill={ink} />
        <path d={`M${cx - pw * 0.7} ${yG - 50 * s}c${pw * 0.2} ${-8 * s} ${pw * 0.5} ${-6 * s} ${pw * 0.7} ${-2 * s}c${pw * 0.2} ${-5 * s} ${pw * 0.5} ${-4 * s} ${pw * 0.7} ${2 * s}v${8 * s}h${-pw * 1.4}z`} fill={moss} opacity=".8" />
      </>
    );
  };
  return (
    <g transform={`rotate(${(j(3) * 0.9).toFixed(2)} 600 ${yG.toFixed(1)}) translate(${(j(5) * 8 * s).toFixed(1)} 0)`}>
      {pillar(600 - half, 0)}
      {pillar(600 + half, 1)}
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

/** Traînées de nuages du couchant : fuseaux effilés, plus chauds près de l'horizon. */
const CLOUDS = [
  { y: 66, x0: -60, x1: 540, h: 15, fill: "#4a2442", o: 0.6 },
  { y: 104, x0: 620, x1: 1280, h: 19, fill: "#5e2638", o: 0.55 },
  { y: 146, x0: 90, x1: 780, h: 12, fill: "#9c3a32", o: 0.5 },
  { y: 182, x0: 690, x1: 1200, h: 10, fill: "#c9894a", o: 0.38 },
  { y: 208, x0: -30, x1: 430, h: 7, fill: "#f2d88a", o: 0.34 },
].map((c) => {
  const w = c.x1 - c.x0;
  return {
    d: `M${c.x0} ${c.y}C${c.x0 + w * 0.22} ${c.y - c.h} ${c.x0 + w * 0.62} ${c.y - c.h * 1.3} ${c.x1} ${c.y - c.h * 0.2}C${c.x1 - w * 0.28} ${c.y + c.h * 0.7} ${c.x0 + w * 0.34} ${c.y + c.h * 0.55} ${c.x0} ${c.y}Z`,
    fill: c.fill,
    o: c.o,
  };
});

/** Dalles du chemin : rangées entre les pieds des torii, joints décalés, pierres de teintes inégales. */
const halfPath = (y: number) => 14 + 416 * ((y - VP.y) / (900 - VP.y));
const ROW_Y = [...GATES.map((d) => groundAt(scaleAt(d))), 900];
const STONE_TONES = ["#a08868", "#8f785c", "#7a6650", "#b09a78", "#94806a"];
const STONES = ROW_Y.slice(0, -1).flatMap((y0, r) => {
  const y1 = ROW_Y[r + 1];
  const n = 3 + (r % 2);
  const joints = [0, ...Array.from({ length: n - 1 }, (_, k) => (k + 1) / n + (noise(r * 7 + k, 3) - 0.5) * 0.14), 1];
  const x = (y: number, t: number) => VP.x - halfPath(y) + 2 * halfPath(y) * t;
  const gy = Math.max(0.6, (y1 - y0) * 0.06);
  return joints.slice(0, -1).map((t0, k) => {
    const t1 = joints[k + 1];
    const g = 0.008;
    const jit = (salt: number) => (noise(r * 11 + k, salt) - 0.5) * (y1 - y0) * 0.18;
    const pts = [
      [x(y0 + gy, t0 + g), y0 + gy + jit(5)],
      [x(y0 + gy, t1 - g), y0 + gy + jit(7)],
      [x(y1 - gy, t1 - g), y1 - gy + jit(9)],
      [x(y1 - gy, t0 + g), y1 - gy + jit(13)],
    ];
    return {
      d: `M${pts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join("L")}Z`,
      fill: STONE_TONES[Math.floor(noise(r * 5 + k, 17) * STONE_TONES.length)],
      w: Math.max(0.6, (y1 - y0) * 0.035),
    };
  });
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
      <OrganicDefs id={u} />
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
          {/* Nuages du couchant en longues traînées peintes */}
          <g filter={`url(#${u}-rough)`}>
            {CLOUDS.map((c, i) => (
              <path key={i} d={c.d} fill={c.fill} opacity={c.o} />
            ))}
            <path d="M0 262C40 236 90 222 120 214C160 222 190 232 220 236C260 214 300 200 330 196C370 210 400 226 430 232C460 224 490 220 520 220C540 232 552 244 560 252H0Z" fill="#2a1830" opacity=".8" />
            <path d="M1200 262C1160 236 1110 218 1080 210C1040 222 1010 232 980 236C940 216 910 204 880 200C840 214 810 230 780 236C750 228 720 222 690 222C670 234 652 244 640 252H1200Z" fill="#2a1830" opacity=".8" />
          </g>
          {/* Sol de gravier et chemin de dalles irrégulières vers le fond, bordé de mousse */}
          <path d={`M0 ${VP.y}H1200V900H0Z`} fill={`url(#${u}-ground)`} />
          <g filter={`url(#${u}-fine)`}>
            <path d={`M${VP.x - 14} ${VP.y}H${VP.x + 14}L${VP.x + 430} 900H${VP.x - 430}Z`} fill={`url(#${u}-path)`} />
            {STONES.map((st, i) => (
              <path key={i} d={st.d} fill={st.fill} stroke="#3a2e24" strokeWidth={st.w} opacity=".9" />
            ))}
            <path d={`M${VP.x - 16} ${VP.y}L${VP.x - 440} 900`} stroke="#3c4a2a" strokeWidth="14" opacity=".55" />
            <path d={`M${VP.x + 16} ${VP.y}L${VP.x + 440} 900`} stroke="#3c4a2a" strokeWidth="14" opacity=".55" />
          </g>
          {/* Lanternes de pierre de part et d'autre, puis le tunnel de torii */}
          <g filter={`url(#${u}-rough)`}>
            {TOROS.slice()
              .reverse()
              .map((t, i) => (
                <g key={i}>
                  <Toro x={VP.x - t.dx} y={t.y} s={t.s} />
                  <Toro x={VP.x + t.dx} y={t.y} s={t.s} />
                </g>
              ))}
            {GATES.map((d) => (
              <Gate key={d} depth={d} />
            ))}
          </g>
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
          <svg key={side} className={`tr-branch tr-branch-${side} arena-near`} viewBox="0 0 300 200" aria-hidden="true">
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
            <svg viewBox="0 0 160 240" aria-hidden="true" className="arena-soft">
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

      <Haze tone="rgb(242 216 138 / .14)" top="20%" height="26%" opacity={0.85} slow={1.3} />
      <Grain />
      <div ref={flare} className="tr-flare" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
    </div>
  );
}
