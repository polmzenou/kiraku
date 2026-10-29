"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { Grain, Haze, moteStyle, OrganicDefs, particles, play, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./chikurin.css";

// La Bambouseraie au clair de lune (月下の竹林), arène du palier Argent : une forêt de bambous sous la
// lune, dans la brume. Bambous, pierres de gué et feuillage sont dessinés pour Kiraku, aux contours
// tremblés ; les lucioles, les voiles de nuages et le shishi-odoshi sont des calques HTML animés.

/** Feuille de bambou lancéolée, pointée vers la droite, longueur l et largeur w. */
const leaf = (l: number, w: number) => `M0 0C${l * 0.28} ${-w} ${l * 0.7} ${-w * 0.55} ${l} 0C${l * 0.7} ${w * 0.55} ${l * 0.28} ${w} 0 0Z`;

type Stalk = { x: number; w: number; bend: number; top: number; base: number; nodes: number[]; leaves: { y: number; a: number; l: number }[]; tone: string; rim: string };

function stalks(count: number, salt: number, o: { w: [number, number]; base: number; top: number; tones: string[]; rim: string; span: [number, number] }): Stalk[] {
  return Array.from({ length: count }, (_, i) => {
    const r = (s: number) => noise(i + salt * 31, s);
    const x = o.span[0] + ((i + 0.5) / count) * (o.span[1] - o.span[0]) + (r(3) - 0.5) * ((o.span[1] - o.span[0]) / count) * 0.8;
    const base = o.base + r(5) * 30;
    const step = 80 + r(7) * 40;
    const nodes = Array.from({ length: Math.ceil((base - o.top) / step) }, (_, k) => base - (k + 1) * step + r(9 + k) * 10).filter((y) => y > o.top);
    const leaves = nodes.filter((_, k) => (k + i) % 2 === 0).map((y, k) => ({ y, a: (r(13 + k) - 0.5) * 70 + (r(17) > 0.5 ? 20 : 160), l: 40 + r(19 + k) * 40 }));
    return { x, w: o.w[0] + r(11) * (o.w[1] - o.w[0]), bend: (r(23) - 0.5) * 40, top: o.top, base, nodes, leaves, tone: o.tones[Math.floor(r(29) * o.tones.length)], rim: o.rim };
  });
}

const FAR = stalks(30, 1, { w: [5, 10], base: 560, top: -40, tones: ["#0d1c20", "#11232a", "#0b171c"], rim: "#5d7a82", span: [-40, 1240] });
const MID = stalks(9, 2, { w: [16, 28], base: 600, top: -60, tones: ["#18302a", "#1c3830", "#142822"], rim: "#a9c1cc", span: [-60, 1260] }).filter((s) => s.x < 470 || s.x > 730);
const STEPS = Array.from({ length: 9 }, (_, i) => {
  const t = i / 8;
  const y = 470 + 400 * t ** 1.3;
  return { x: 600 + Math.sin(i * 1.3) * (30 + 80 * t), y, rx: 26 + 110 * t, ry: 7 + 26 * t, r: (noise(i, 41) - 0.5) * 12 };
});

function Bamboo({ s }: { s: Stalk }) {
  const half = s.w / 2;
  const d = `M${s.x - half} ${s.base}Q${s.x - half + s.bend} ${(s.base + s.top) / 2} ${s.x - half * 0.8 + s.bend * 1.6} ${s.top}H${s.x + half * 0.8 + s.bend * 1.6}Q${s.x + half + s.bend} ${(s.base + s.top) / 2} ${s.x + half} ${s.base}Z`;
  const at = (y: number) => s.x + s.bend * 1.6 * ((s.base - y) / (s.base - s.top)) ** 1.6;
  return (
    <g>
      <path d={d} fill={s.tone} />
      <path d={`M${s.x + half * 0.5} ${s.base}Q${s.x + half * 0.5 + s.bend} ${(s.base + s.top) / 2} ${s.x + half * 0.45 + s.bend * 1.6} ${s.top}`} stroke={s.rim} strokeWidth={Math.max(1, s.w * 0.12)} fill="none" opacity=".45" />
      {s.nodes.map((y) => (
        <path key={y} d={`M${at(y) - half * 1.05} ${y}h${s.w * 1.05}`} stroke={s.rim} strokeWidth={Math.max(1, s.w * 0.16)} opacity=".5" strokeLinecap="round" />
      ))}
      {s.leaves.map((l, k) => (
        <g key={k} transform={`translate(${at(l.y).toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.a.toFixed(1)})`}>
          <path d={`M0 0L${l.l * 0.3} 0`} stroke={s.tone} strokeWidth="2" />
          <path d={leaf(l.l, l.l * 0.13)} transform={`translate(${l.l * 0.25} 0)`} fill={s.tone} />
          <path d={leaf(l.l * 0.8, l.l * 0.11)} transform={`translate(${l.l * 0.22} 2) rotate(24)`} fill={s.tone} />
          <path d={leaf(l.l * 0.7, l.l * 0.1)} transform={`translate(${l.l * 0.2} -2) rotate(-26)`} fill={s.tone} opacity=".9" />
        </g>
      ))}
    </g>
  );
}

export function ChikurinArena({ level, handleRef, sound }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const flies = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.2 },
      { ref: mid, depth: 0.6 },
      { ref: edges, depth: 1.5 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "hit":
          shower(fx.current, "ck-leaf", particles(level, 4), { from: [0.15, 0.85], y0: 0.05, fall: 0.6, drift: 0.2, duration: 2_200, spin: 360 });
          break;
        case "crit":
        case "ko":
          // Coup de vent : les bambous se couchent, les feuilles volent, les lucioles s'enfuient
          pulse(mid.current, [{ transform: "skewX(0deg)" }, { transform: "skewX(-3.5deg)", offset: 0.25 }, { transform: "skewX(1.5deg)", offset: 0.6 }, { transform: "skewX(0deg)" }], { duration: 1_400, composite: "add" });
          shower(fx.current, "ck-leaf", particles(level, 18), { from: [0, 0.4], y0: 0.15, fall: 0.45, drift: 1.1, duration: 1_700, spin: 720 });
          pulse(flies.current, [{ transform: "translate(0px, 0px)", opacity: 1 }, { transform: "translate(40px, -60px)", opacity: 0, offset: 0.3 }, { transform: "translate(0px, 0px)", opacity: 0, offset: 0.7 }, { transform: "translate(0px, 0px)", opacity: 1 }], { duration: 3_000 });
          break;
        case "technique":
          pulse(halo.current, [{ opacity: 0.7 }, { opacity: 1, offset: 0.3 }, { opacity: 0.7 }], { duration: 1_000 });
          break;
        case "victory":
          pulse(flies.current, [{ transform: "translateY(0px)" }, { transform: "translateY(-30%)" }], { duration: 4_000, fill: "forwards", easing: "ease-in" });
          pulse(halo.current, [{ opacity: 0.7 }, { opacity: 1 }], { duration: 1_500, fill: "forwards" });
          break;
        case "defeat":
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 1_600, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const fireflies = particles(level, 20);

  return (
    <div className="arena arena-chikurin" data-level={level}>
      <OrganicDefs id={u} />
      {/* Ciel de nuit, lune, bambous lointains et sol de mousse */}
      <div ref={far} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#060b16" />
              <stop offset=".25" stopColor="#0c182a" />
              <stop offset=".5" stopColor="#16283a" />
              <stop offset=".62" stopColor="#1d3238" />
            </linearGradient>
            <radialGradient id={`${u}-moon`} cx="45%" cy="40%" r="60%">
              <stop offset="0" stopColor="#fbfaf2" />
              <stop offset=".7" stopColor="#e6e8de" />
              <stop offset="1" stopColor="#c9d6dc" />
            </radialGradient>
            <linearGradient id={`${u}-ground`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1c2c2a" />
              <stop offset=".5" stopColor="#14211e" />
              <stop offset="1" stopColor="#0a1210" />
            </linearGradient>
            <radialGradient id={`${u}-pool`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#c9dcf3" stopOpacity=".26" />
              <stop offset="1" stopColor="#c9dcf3" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1200" height="900" fill={`url(#${u}-sky)`} />
          <circle cx="650" cy="150" r="66" fill={`url(#${u}-moon)`} />
          <g filter={`url(#${u}-rough)`} opacity=".9">
            {FAR.map((s, i) => (
              <Bamboo key={i} s={s} />
            ))}
          </g>
          <path d="M0 470C200 456 420 462 600 466C800 470 1000 458 1200 468V900H0Z" fill={`url(#${u}-ground)`} />
          <ellipse cx="600" cy="620" rx="380" ry="120" fill={`url(#${u}-pool)`} />
          <g filter={`url(#${u}-fine)`}>
            {STEPS.map((p, i) => (
              <g key={i} transform={`rotate(${p.r.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                <ellipse cx={p.x} cy={p.y + p.ry * 0.25} rx={p.rx} ry={p.ry} fill="#0b1412" opacity=".7" />
                <ellipse cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill="#4a5a5c" />
                <ellipse cx={p.x - p.rx * 0.15} cy={p.y - p.ry * 0.25} rx={p.rx * 0.7} ry={p.ry * 0.5} fill="#7d9196" opacity=".55" />
              </g>
            ))}
            {Array.from({ length: 40 }, (_, i) => (
              <circle key={i} cx={noise(i, 51) * 1200} cy={480 + noise(i, 53) ** 0.8 * 420} r={2 + noise(i, 57) * 6} fill="#2c4a34" opacity=".6" />
            ))}
          </g>
        </svg>
      </div>

      {/* Voiles de nuages qui passent devant la lune */}
      <div ref={halo} className="arena-prop ck-halo" style={{ ["--px" as string]: 470, ["--py" as string]: -30, ["--pw" as string]: 360, ["--ph" as string]: 360 }} />
      {level !== "reduced" && (
        <div className="arena-prop ck-veils" style={{ ["--px" as string]: 300, ["--py" as string]: 90, ["--pw" as string]: 700, ["--ph" as string]: 120 }} aria-hidden="true">
          <i />
          <i />
        </div>
      )}
      <Haze tone="rgb(201 214 230 / .2)" top="32%" height="22%" opacity={0.95} />

      {/* Bambous du plan moyen, qui se balancent */}
      <div ref={mid} className="arena-plane ck-mid">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g filter={`url(#${u}-rough)`}>
            {MID.map((s, i) => (
              <Bamboo key={i} s={s} />
            ))}
          </g>
        </svg>
      </div>

      {/* Lucioles */}
      <div ref={flies} className="ck-flies" aria-hidden="true">
        {Array.from({ length: fireflies }, (_, i) => (
          <span key={i} className="ck-fly" style={moteStyle(i, 21, { x: [6, 94], y: [30, 78] }, [5, 11], [3, 5])} />
        ))}
      </div>
      <Haze tone="rgb(201 214 230 / .16)" top="62%" height="20%" opacity={0.8} slow={0.8} />

      {/* Abords : feuillage au premier plan, shishi-odoshi qui frappe la pierre */}
      <div ref={edges} className="arena-edges">
        {["l", "r"].map((side) => (
          <svg key={side} className={`ck-fronds ck-fronds-${side} arena-near`} viewBox="0 0 300 220" aria-hidden="true">
            <path d="M-10 40C60 50 120 80 170 120" stroke="#0c1a16" strokeWidth="7" fill="none" />
            {[
              [20, 44, 18, 110],
              [60, 58, -10, 120],
              [100, 76, 30, 100],
              [140, 100, 8, 116],
              [80, 40, -40, 90],
              [150, 82, -30, 96],
              [40, 30, 50, 80],
            ].map(([x, y, a, l], i) => (
              <path key={i} transform={`translate(${x} ${y}) rotate(${a})`} d={leaf(l, l * 0.14)} fill={i % 2 ? "#11241c" : "#0c1a14"} />
            ))}
          </svg>
        ))}
        <div className="ck-shishi" aria-hidden="true">
          <svg viewBox="0 0 220 160" className="ck-shishi-base">
            <ellipse cx="150" cy="140" rx="64" ry="16" fill="#2a3a3a" />
            <ellipse cx="150" cy="134" rx="56" ry="11" fill="#3e5254" />
            <ellipse cx="150" cy="133" rx="40" ry="6" fill="#16303a" />
            <path d="M58 150V70M84 150V70" stroke="#2f4a2c" strokeWidth="9" />
            <path d="M52 76h38" stroke="#24381f" strokeWidth="6" />
            <path d="M30 40c20 0 30 6 34 18" stroke="#3a5a34" strokeWidth="10" fill="none" strokeLinecap="round" />
          </svg>
          <span className="ck-shishi-pipe" onAnimationIteration={() => play(sound, "knock")} />
        </div>
      </div>

      <Grain />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
    </div>
  );
}
