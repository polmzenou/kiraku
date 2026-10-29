"use client";

import { useId, useRef } from "react";
import { moteStyle, particles, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./dojo.css";

// Le Dōjō de la lanterne (灯の道場), arène du palier Bronze : un dōjō de bois la nuit. Fond peint en SVG
// statique (toile 1200 × 900, cadrée au centre) ; les éléments animés sont des calques HTML posés sur la
// même toile (variables --px/--py, voir arena.css), animés en transform et opacity.

const PLANKS = Array.from({ length: 25 }, (_, i) => i - 12);
const SEAMS = [338, 366, 402, 448, 508, 586, 690, 830];
const RAFTERS = [-300, -60, 180, 420, 600, 780, 1020, 1260, 1500];
const SHIDE = [8, 22, 36, 50, 64, 78, 92];

export function DojoArena({ level, handleRef }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const floor = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const taiko = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const rope = useRef<HTMLDivElement>(null);
  const andons = useRef<HTMLDivElement>(null);
  const flare = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const full = level === "full";

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.25 },
      { ref: floor, depth: 0.55 },
      { ref: edges, depth: 1.5 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "turn":
          pulse(taiko.current, [{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(-2.5deg) scale(1.05)", offset: 0.2 }, { transform: "rotate(1.6deg) scale(.99)", offset: 0.5 }, { transform: "rotate(0deg) scale(1)" }], { duration: 520 });
          pulse(ring.current, [{ transform: "scale(.6)", opacity: 0.8 }, { transform: "scale(1.9)", opacity: 0 }], { duration: 700, easing: "ease-out" });
          break;
        case "crit":
        case "ko":
          shower(fx.current, "dj-dustfall", particles(level, 16), { from: [0.08, 0.92], y0: 0.02, fall: 0.55, drift: 0.08, duration: 1_600 });
          pulse(far.current, [{ transform: "translate(0px, 0px)" }, { transform: "translate(1.5px, -1px)" }, { transform: "translate(-1.5px, 1px)" }, { transform: "translate(0px, 0px)" }], { duration: 280, composite: "add" });
          rope.current?.querySelectorAll(".dj-shide").forEach((s, i) =>
            pulse(s, [{ transform: "rotate(0deg)" }, { transform: `rotate(${i % 2 ? 14 : -14}deg)`, offset: 0.25 }, { transform: `rotate(${i % 2 ? -8 : 8}deg)`, offset: 0.6 }, { transform: "rotate(0deg)" }], { duration: 900, composite: "add" }),
          );
          if (reaction === "ko") {
            const glows = andons.current?.querySelectorAll(".dj-andon-glow");
            glows?.forEach((g, i) => pulse(g, [{ opacity: 1 }, { opacity: 0.15, offset: 0.12 }, { opacity: 0.4, offset: 0.4 }, { opacity: 1 }], { duration: 2_200, delay: i * 120 }));
          }
          break;
        case "technique":
          pulse(flare.current, [{ opacity: 0 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], { duration: 900 });
          break;
        case "victory":
          pulse(flare.current, [{ opacity: 0 }, { opacity: 0.7, offset: 0.3 }, { opacity: 0.25 }], { duration: 1_600, fill: "forwards" });
          shower(fx.current, "dj-confetti", particles(level, 42), { from: [0, 1], y0: -0.05, fall: 1.05, drift: 0.25, duration: 3_400, spin: 720 });
          break;
        case "defeat":
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 1_400, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const motes = particles(level, 22);

  return (
    <div className="arena arena-dojo" data-level={level}>
      {/* Fond : plafond, imposte ajourée, shoji, tokonoma et kakejiku, murs en perspective */}
      <div ref={far} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-paper`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6dfae" />
              <stop offset=".55" stopColor="#e8bf84" />
              <stop offset="1" stopColor="#b98450" />
            </linearGradient>
            <linearGradient id={`${u}-wallL`} x1="0" x2="1">
              <stop offset="0" stopColor="#0c0704" />
              <stop offset="1" stopColor="#2a190d" />
            </linearGradient>
            <linearGradient id={`${u}-wallR`} x1="1" x2="0">
              <stop offset="0" stopColor="#0c0704" />
              <stop offset="1" stopColor="#2a190d" />
            </linearGradient>
            <linearGradient id={`${u}-post`} x1="0" x2="1">
              <stop offset="0" stopColor="#1e130a" />
              <stop offset=".5" stopColor="#3f2816" />
              <stop offset="1" stopColor="#1a1008" />
            </linearGradient>
            <radialGradient id={`${u}-alcove`} cx="50%" cy="38%" r="72%">
              <stop offset="0" stopColor="#4d3219" />
              <stop offset="1" stopColor="#170d06" />
            </radialGradient>
            <linearGradient id={`${u}-moon`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#dce8f6" />
              <stop offset="1" stopColor="#8fa9cf" />
            </linearGradient>
            <pattern id={`${u}-kumiko`} width="26" height="34" patternUnits="userSpaceOnUse">
              <path d="M0 .8H26M.8 0V34" stroke="#70492a" strokeWidth="1.7" opacity=".55" />
            </pattern>
          </defs>
          <rect width="1200" height="900" fill="#100a06" />
          {/* Plafond et chevrons */}
          <path d="M0 0H1200V62L1020 96H180L0 62Z" fill="#170e07" />
          {RAFTERS.map((x) => (
            <path key={x} d={`M${x} 0L${600 + (x - 600) * 0.4} 96`} stroke="#2b1a0d" strokeWidth="12" />
          ))}
          <rect x="176" y="88" width="848" height="12" fill="#2f1d0f" />
          {/* Imposte ajourée (ranma) : nuages découpés éclairés par derrière */}
          <rect x="180" y="100" width="840" height="44" fill="#26170b" />
          {[236, 336, 446, 756, 866, 966].map((x, i) => (
            <path
              key={x}
              d={`M${x - 34} 128c6-12 18-14 26-8 6-10 22-10 28 0 10-4 20 2 20 10-6 6-14 6-20 2-8 8-22 8-28 0-8 6-20 4-26-4z`}
              fill="#f3cf92"
              opacity={0.75 + (i % 2) * 0.15}
            />
          ))}
          {/* Shoji */}
          <rect x="180" y="144" width="840" height="170" fill={`url(#${u}-paper)`} />
          <rect x="180" y="144" width="840" height="170" fill={`url(#${u}-kumiko)`} />
          {[180, 383, 538, 652, 807, 1010].map((x) => (
            <rect key={x} x={x} y="140" width="10" height="178" fill={`url(#${u}-post)`} />
          ))}
          <rect x="176" y="139" width="848" height="7" fill="#2f1d0f" />
          <rect x="176" y="310" width="848" height="9" fill="#2a190c" />
          {/* Tokonoma : alcôve, kakejiku 闘 et brûle-parfum */}
          <rect x="545" y="100" width="110" height="214" fill={`url(#${u}-alcove)`} />
          <rect x="571" y="112" width="58" height="170" fill="#ebdfbf" />
          <rect x="571" y="112" width="58" height="22" fill="#6e4b2b" />
          <rect x="571" y="260" width="58" height="22" fill="#6e4b2b" />
          <rect x="566" y="107" width="68" height="7" rx="3.5" fill="#1b110a" />
          <rect x="564" y="280" width="72" height="8" rx="4" fill="#1b110a" />
          <text x="600" y="219" textAnchor="middle" fontSize="56" fill="#1f1b17" style={{ fontFamily: "var(--font-seal)" }}>
            闘
          </text>
          <rect x="612" y="238" width="9" height="9" fill="#c8372d" />
          <rect x="545" y="298" width="110" height="16" fill="#2b1a0e" />
          <path d="M590 298c0-9 4-13 10-13s10 4 10 13z" fill="#7a5a2a" />
          {/* Murs latéraux en perspective, fenêtre de lune à gauche, râtelier de bokken à droite */}
          <path d="M0 62L180 96V318L0 432Z" fill={`url(#${u}-wallL)`} />
          <path d="M1200 62L1020 96V318L1200 432Z" fill={`url(#${u}-wallR)`} />
          <path d="M70 76V390M128 86V352" stroke="#22150a" strokeWidth="9" />
          <path d="M1130 76V390M1072 86V352" stroke="#22150a" strokeWidth="9" />
          <path d="M28 152L116 168V264L28 280Z" fill={`url(#${u}-moon)`} opacity=".9" />
          <path d="M57 157V275M86 162V270M28 196L116 205M28 238L116 236" stroke="#2a190c" strokeWidth="4" />
          <path d="M1092 180l60-10M1092 210l60-10M1092 240l60-10" stroke="#5a3a20" strokeWidth="6" strokeLinecap="round" />
          <path d="M1100 160V250M1122 156V246M1144 152V242" stroke="#c9b28a" strokeWidth="4" strokeLinecap="round" />
          {/* Kamidana : petit sanctuaire de bois, sakaki et shide */}
          <rect x="688" y="104" width="104" height="8" fill="#5a3a20" />
          <path d="M716 104l24-20 24 20z" fill="#d9b556" opacity=".85" />
          <rect x="722" y="86" width="36" height="18" fill="#c9a86a" />
          <circle cx="740" cy="95" r="4" fill="#f2d88a" />
          <path d="M700 104c-6-10-2-18 6-16 2-8 12-6 12 2" fill="#3d6b3a" />
          <path d="M780 104c6-10 2-18-6-16-2-8-12-6-12 2" fill="#3d6b3a" />
          <path d="M732 112l-4 10 6 4-4 10M748 112l4 10-6 4 4 10" stroke="#f3ecdf" strokeWidth="2.4" fill="none" />
        </svg>
      </div>

      {/* Lueur des shoji (bougies derrière le papier) et ombres qui passent */}
      <div className="arena-prop dj-glow" style={{ ["--px" as string]: 176, ["--py" as string]: 96, ["--pw" as string]: 848, ["--ph" as string]: 224 }} />
      {full && (
        <div className="arena-prop dj-shadows" style={{ ["--px" as string]: 190, ["--py" as string]: 146, ["--pw" as string]: 820, ["--ph" as string]: 166 }}>
          <svg className="dj-walker" viewBox="0 0 80 160" aria-hidden="true">
            <path d="M40 8c9 0 14 7 14 15s-5 14-14 14-14-6-14-14 5-15 14-15zM22 44c6-4 30-4 36 0l8 52-10 2-4 58H28l-4-58-10-2z" fill="#3b2412" />
            <path d="M62 60l16 10v16l-6 2-4-10z" fill="#3b2412" />
            <circle cx="76" cy="92" r="9" fill="#ffe2a8" opacity=".9" />
          </svg>
        </div>
      )}

      {/* Plancher de hinoki en perspective et reflets des lampes */}
      <div ref={floor} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-floor`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5a3d24" />
              <stop offset=".35" stopColor="#7d5634" />
              <stop offset=".75" stopColor="#6a4729" />
              <stop offset="1" stopColor="#3e2814" />
            </linearGradient>
            <radialGradient id={`${u}-pool`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#ffd9a0" stopOpacity=".42" />
              <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${u}-moonpool`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#cfe0f5" stopOpacity=".3" />
              <stop offset="1" stopColor="#cfe0f5" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M0 432L180 318H1020L1200 432V900H0Z" fill={`url(#${u}-floor)`} />
          {PLANKS.map((k) => (
            <path key={k} d={`M${600 + k * 23.5} 318L${600 + k * 112} 900`} stroke="#3a2513" strokeWidth={k % 2 ? 1.6 : 2.4} opacity=".55" />
          ))}
          {SEAMS.map((y, i) => (
            <path key={y} d={`M0 ${y}H1200`} stroke="#3a2513" strokeWidth={1 + i * 0.25} opacity=".22" />
          ))}
          <ellipse cx="600" cy="600" rx="360" ry="96" fill={`url(#${u}-moonpool)`} />
          <ellipse cx="300" cy="760" rx="260" ry="80" fill={`url(#${u}-pool)`} />
          <ellipse cx="900" cy="760" rx="260" ry="80" fill={`url(#${u}-pool)`} />
          <path d="M180 318H1020" stroke="#ffd9a0" strokeOpacity=".18" strokeWidth="3" />
        </svg>
      </div>

      {/* Taiko accroché au mur : il vibre à chaque tour */}
      <div ref={taiko} className="arena-prop dj-taiko" style={{ ["--px" as string]: 404, ["--py" as string]: 132, ["--pw" as string]: 96, ["--ph" as string]: 118 }}>
        <svg viewBox="0 0 96 118" aria-hidden="true">
          <path d="M30 4L48 22L66 4" stroke="#c9b28a" strokeWidth="2.4" fill="none" />
          <ellipse cx="48" cy="70" rx="44" ry="44" fill="#6b2a1a" />
          <ellipse cx="48" cy="70" rx="36" ry="36" fill="#e2c79a" />
          <ellipse cx="48" cy="70" rx="36" ry="36" fill="none" stroke="#2a190c" strokeWidth="2" strokeDasharray="1.5 6" />
          <g fill="#2a190c">
            <path d="M48 52a9 9 0 1 1-9 9c0-6 6-5 6-9z" />
            <path d="M62.5 78.5a9 9 0 1 1-12.6 1.3c4 4.7 6.3-.3 10.3-1.5z" />
            <path d="M33.6 79.9a9 9 0 1 1 14.2-6c-5.9-1.3-6 4.2-11 5.2z" />
          </g>
        </svg>
        <span ref={ring} className="dj-taiko-ring" />
      </div>

      {/* Rayon de lune et poussière qui y flotte */}
      <div className="dj-beam" aria-hidden="true">
        {Array.from({ length: motes }, (_, i) => (
          <span key={i} className="dj-mote" style={moteStyle(i, 3, { x: [8, 92], y: [6, 94] }, [7, 14], [2, 4])} />
        ))}
      </div>

      {/* Abords : piliers, shimenawa et shide, andon aux coins */}
      <div ref={edges} className="arena-edges">
        <span className="dj-pillar dj-pillar-l" />
        <span className="dj-pillar dj-pillar-r" />
        <div ref={rope} className="dj-rope">
          <svg viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`${u}-straw`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e6d29b" />
                <stop offset=".55" stopColor="#b8995a" />
                <stop offset="1" stopColor="#7a6232" />
              </linearGradient>
            </defs>
            <path d="M-20 10C300 52 900 52 1220 10L1220 30C900 74 300 74 -20 30Z" fill={`url(#${u}-straw)`} />
            <path d="M-20 18C300 60 900 60 1220 18" stroke="#6e5629" strokeWidth="2" strokeDasharray="14 10" fill="none" opacity=".7" />
          </svg>
          {SHIDE.map((x, i) => (
            // Accrochés sous la corde, qui pend au milieu
            <span key={x} className="dj-shide" style={{ left: `${x}%`, top: `${38 + 46 * (1 - (x / 50 - 1) ** 2)}%`, animationDelay: `${-i * 0.7}s` }} />
          ))}
        </div>
        <div ref={andons} className="dj-andons">
          {["l", "r"].map((s) => (
            <span key={s} className={`dj-andon dj-andon-${s}`}>
              <span className="dj-andon-glow" />
              <svg viewBox="0 0 60 110" aria-hidden="true">
                <rect x="4" y="96" width="52" height="10" fill="#2a190c" />
                <rect x="10" y="20" width="40" height="76" fill="#f6dfae" />
                <rect x="10" y="20" width="40" height="76" fill="none" stroke="#3b2716" strokeWidth="4" />
                <path d="M30 20V96M10 58H50" stroke="#3b2716" strokeWidth="2.4" />
                <path d="M6 20h48l-6-12H12z" fill="#2a190c" />
              </svg>
            </span>
          ))}
        </div>
      </div>

      <div ref={flare} className="dj-flare" aria-hidden="true" />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
    </div>
  );
}
