"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { Grain, Haze, OrganicDefs, particles, play, pulse, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./suiu.css";

// Le Jardin de jade sous la pluie (翠雨の庭), arène du palier Émeraude : un jardin au crépuscule sous
// l'averse. Pont vermillon et son reflet, étang, lanterne yukimi, hortensias et pins taillés sont
// dessinés pour Kiraku ; la pluie, les ronds dans l'eau, les koi et l'éclair sont des calques animés.

/** Massif de feuillage en nuage (pin taillé, érable) : grappes de lobes irréguliers. */
function Foliage({ x, y, r, tone, n = 7, salt }: { x: number; y: number; r: number; tone: string; n?: number; salt: number }) {
  return (
    <g fill={tone}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const k = 0.5 + noise(i + salt, 3) * 0.5;
        return <ellipse key={i} cx={x + Math.cos(a) * r * 0.62 * k} cy={y + Math.sin(a) * r * 0.32 * k} rx={r * (0.42 + noise(i + salt, 5) * 0.22)} ry={r * (0.26 + noise(i + salt, 7) * 0.12)} />;
      })}
      <ellipse cx={x} cy={y} rx={r * 0.62} ry={r * 0.34} />
    </g>
  );
}

/** Hortensia : un dôme de petites fleurs à quatre pétales. */
function Hydrangea({ x, y, r, hue, salt }: { x: number; y: number; r: number; hue: readonly string[]; salt: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y + r * 0.4} rx={r * 1.2} ry={r * 0.6} fill="#123024" />
      {Array.from({ length: 26 }, (_, i) => {
        const a = noise(i + salt, 11) * Math.PI * 2;
        const d = Math.sqrt(noise(i + salt, 13)) * r;
        const fx = x + Math.cos(a) * d;
        const fy = y + Math.sin(a) * d * 0.7;
        const s = r * 0.16;
        return (
          <g key={i} transform={`translate(${fx.toFixed(1)} ${fy.toFixed(1)}) rotate(${Math.round(noise(i, 17) * 90)})`} fill={hue[i % hue.length]}>
            <ellipse cx={-s * 0.55} cy="0" rx={s * 0.55} ry={s * 0.4} />
            <ellipse cx={s * 0.55} cy="0" rx={s * 0.55} ry={s * 0.4} />
            <ellipse cx="0" cy={-s * 0.55} rx={s * 0.4} ry={s * 0.55} />
            <ellipse cx="0" cy={s * 0.55} rx={s * 0.4} ry={s * 0.55} />
          </g>
        );
      })}
    </g>
  );
}

/** Aigrette debout dans l'eau peu profonde (dessin original), avec son reflet écrasé ; x, y : les pattes à la surface. */
function Egret({ x, y }: { x: number; y: number }) {
  const body = "M-22 -30C-18 -42 -4 -52 10 -52C18 -52 22 -46 20 -38C17 -30 6 -26 -6 -26C-12 -26 -18 -26 -22 -30Z";
  const neck = "M14 -48C22 -58 10 -66 10 -76C10 -84 12 -88 14 -92";
  return (
    <g transform={`translate(${x} ${y})`}>
      <g opacity=".22" transform="scale(1 -0.6)">
        <path d={body} fill="#f3ecdf" />
        <path d={neck} stroke="#f3ecdf" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
      <path d="M-3 -30L-5 0M3 -30L5 0" stroke="#1a1f1c" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M-22 -30L-36 -21L-20 -27Z" fill="#dfe6e2" />
      <path d={body} fill="#f3ecdf" />
      <path d="M-18 -29C-6 -27 8 -28 18 -36C14 -29 4 -26 -6 -26C-12 -26 -16 -27 -18 -29Z" fill="#b9c9c4" />
      <path d={neck} stroke="#f3ecdf" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <ellipse cx="14" cy="-92" rx="5.5" ry="4" fill="#f3ecdf" />
      <path d="M18 -93L33 -90L18 -89Z" fill="#1a1f1c" />
      <circle cx="15.5" cy="-93" r="1" fill="#15120f" />
      <path d="M10 -94C2 -97 -4 -95 -8 -90" stroke="#f3ecdf" strokeWidth="1" fill="none" opacity=".8" />
      <ellipse cx="0" cy="0" rx="14" ry="2.5" fill="none" stroke="#cfe3e0" strokeWidth="1" opacity=".5" />
    </g>
  );
}

/** Rameaux du saule pleureur : une tige souple et ses feuilles étroites en tirets. */
const WILLOW = Array.from({ length: 13 }, (_, i) => {
  const x = 12 + i * 18 + (noise(i, 101) - 0.5) * 10;
  const len = 130 + noise(i, 103) * 160;
  const drift = (noise(i, 107) - 0.5) * 24;
  return { d: `M${x.toFixed(1)} 6C${(x + 8).toFixed(1)} ${(len * 0.35).toFixed(1)} ${(x - 6).toFixed(1)} ${(len * 0.7).toFixed(1)} ${(x + drift).toFixed(1)} ${len.toFixed(1)}`, tone: ["#3a7a5c", "#2f6b52", "#4e8a68"][i % 3] };
});

const BRIDGE = { x0: 300, x1: 900, base: 262, rise: 84 };
const archY = (x: number) => BRIDGE.base - BRIDGE.rise * Math.sin(((x - BRIDGE.x0) / (BRIDGE.x1 - BRIDGE.x0)) * Math.PI);
const POSTS = Array.from({ length: 13 }, (_, i) => BRIDGE.x0 + 20 + (i / 12) * (BRIDGE.x1 - BRIDGE.x0 - 40));
const RIPPLES = Array.from({ length: 18 }, (_, i) => ({ x: (i % 3 ? 400 : 120) + noise(i, 61) * (i % 3 ? 400 : 960), y: 350 + noise(i, 63) * 200, d: 2.2 + noise(i, 67) * 2.6, delay: -noise(i, 71) * 4 }));
const BLUE = ["#6b7fc4", "#8f9fe0", "#5a6ab0", "#a9b8f0"] as const;
const VIOLET = ["#8f7fd1", "#b09ae6", "#7a64c0", "#d4c6f0"] as const;

export function SuiuArena({ level, handleRef, sound }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const sun = useRef<HTMLDivElement>(null);
  const leap = useRef<HTMLSpanElement>(null);
  const dim = useRef<HTMLDivElement>(null);

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.25 },
      { ref: near, depth: 0.7 },
      { ref: edges, depth: 1.5 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "crit":
          // Éclair (deux lueurs, sous le seuil des flashs) puis l'averse redouble
          pulse(flash.current, [{ opacity: 0 }, { opacity: 0.5, offset: 0.08 }, { opacity: 0.05, offset: 0.2 }, { opacity: 0.35, offset: 0.32 }, { opacity: 0 }], { duration: 700, easing: "linear" });
          pulse(rain.current, [{ opacity: 0.75 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0.75 }], { duration: 2_600 });
          play(sound, "thunder");
          break;
        case "ko":
          // Un koi saute hors de l'eau
          pulse(leap.current, [
            { transform: "translate(0%, 0%) rotate(-30deg) scale(.8)", opacity: 0 },
            { transform: "translate(40%, -150%) rotate(10deg) scale(1)", opacity: 1, offset: 0.45 },
            { transform: "translate(90%, 0%) rotate(60deg) scale(.85)", opacity: 0.9, offset: 0.9 },
            { transform: "translate(95%, 10%) rotate(70deg) scale(.8)", opacity: 0 },
          ], { duration: 1_300, easing: "cubic-bezier(.3,.1,.5,1)" });
          setTimeout(() => play(sound, "splash"), 1_100);
          break;
        case "technique":
          pulse(sun.current, [{ opacity: 0 }, { opacity: 0.5, offset: 0.3 }, { opacity: 0 }], { duration: 1_400 });
          break;
        case "victory":
          pulse(rain.current, [{ opacity: 0.75 }, { opacity: 0 }], { duration: 2_000, fill: "forwards" });
          pulse(sun.current, [{ opacity: 0 }, { opacity: 0.85 }], { duration: 2_400, fill: "forwards" });
          break;
        case "defeat":
          pulse(rain.current, [{ opacity: 0.75 }, { opacity: 1 }], { duration: 1_200, fill: "forwards" });
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 1_600, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const ripples = particles(level, RIPPLES.length);

  return (
    <div className="arena arena-suiu" data-level={level}>
      <OrganicDefs id={u} />
      {/* Ciel de pluie, jardin lointain, pont vermillon */}
      <div ref={far} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0c1c1c" />
              <stop offset=".2" stopColor="#1a3735" />
              <stop offset=".31" stopColor="#31534b" />
              <stop offset=".38" stopColor="#48695d" />
            </linearGradient>
            <linearGradient id={`${u}-water`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#41645a" />
              <stop offset=".35" stopColor="#25453f" />
              <stop offset="1" stopColor="#0e2523" />
            </linearGradient>
            <radialGradient id={`${u}-mist`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#7fa498" stopOpacity=".34" />
              <stop offset="1" stopColor="#7fa498" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${u}-bank`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#24372e" />
              <stop offset="1" stopColor="#0e1a15" />
            </linearGradient>
          </defs>
          <rect width="1200" height="900" fill={`url(#${u}-sky)`} />
          <ellipse cx="570" cy="130" rx="330" ry="130" fill={`url(#${u}-mist)`} />
          <g filter={`url(#${u}-rough)`}>
            {/* Pins taillés et érables du fond, maison de thé */}
            <path d="M760 214l70-34 70 34z" fill="#0e201c" />
            <rect x="776" y="214" width="108" height="50" fill="#132824" />
            <rect x="790" y="226" width="30" height="26" fill="#d9b556" opacity=".35" />
            <Foliage x={140} y={170} r={110} tone="#0f2622" salt={1} />
            <Foliage x={330} y={150} r={80} tone="#122c26" salt={2} />
            <Foliage x={1020} y={160} r={120} tone="#0f2622" salt={3} />
            <Foliage x={640} y={190} r={60} tone="#143028" salt={4} />
            <path d="M120 260C130 220 150 200 140 170M1030 270C1020 230 1010 210 1020 160" stroke="#0a1814" strokeWidth="12" fill="none" />
            {/* Rive lointaine */}
            <path d="M0 300C200 290 420 296 600 298C800 300 1000 292 1200 300V330H0Z" fill="#1c3028" />
            {/* Pont vermillon arqué (taikobashi) : tablier, garde-corps, poteaux */}
            <path d={`M${BRIDGE.x0} ${BRIDGE.base + 8}Q600 ${BRIDGE.base - BRIDGE.rise * 2 + 8} ${BRIDGE.x1} ${BRIDGE.base + 8}L${BRIDGE.x1} ${BRIDGE.base + 22}Q600 ${BRIDGE.base - BRIDGE.rise * 2 + 22} ${BRIDGE.x0} ${BRIDGE.base + 22}Z`} fill="#9c2a22" />
            <path d={`M${BRIDGE.x0} ${BRIDGE.base - 18}Q600 ${BRIDGE.base - BRIDGE.rise * 2 - 18} ${BRIDGE.x1} ${BRIDGE.base - 18}`} stroke="#c8372d" strokeWidth="7" fill="none" />
            {POSTS.map((x) => (
              <path key={x} d={`M${x} ${archY(x) - 20}V${archY(x) + 10}`} stroke="#c8372d" strokeWidth="6" />
            ))}
            {POSTS.filter((_, i) => i % 4 === 0).map((x) => (
              <path key={`k${x}`} d={`M${x} ${archY(x) - 26}c-4-6 4-10 0-14`} stroke="#d9b556" strokeWidth="4" fill="none" />
            ))}
          </g>
          {/* Étang : reflet du pont, nénuphars */}
          <rect x="0" y="328" width="1200" height="260" fill={`url(#${u}-water)`} />
          <g opacity=".5" filter={`url(#${u}-fine)`}>
            <path d={`M${BRIDGE.x0} ${2 * 330 - BRIDGE.base - 8}Q600 ${2 * 330 - (BRIDGE.base - BRIDGE.rise * 2 + 8)} ${BRIDGE.x1} ${2 * 330 - BRIDGE.base - 8}`} stroke="#c8372d" strokeWidth="14" fill="none" />
            <path d={`M${BRIDGE.x0} ${2 * 330 - BRIDGE.base + 18}Q600 ${2 * 330 - (BRIDGE.base - BRIDGE.rise * 2 - 18)} ${BRIDGE.x1} ${2 * 330 - BRIDGE.base + 18}`} stroke="#c8372d" strokeWidth="5" fill="none" opacity=".8" />
            {POSTS.map((x) => (
              <path key={x} d={`M${x} ${660 - archY(x) - 10}V${660 - archY(x) + 20}`} stroke="#c8372d" strokeWidth="4" opacity=".7" />
            ))}
            <path d="M0 336C300 344 900 344 1200 336" stroke="#5c8a7a" strokeWidth="3" fill="none" />
          </g>
          {[
            [470, 346, 90],
            [640, 352, 120],
            [800, 344, 70],
            [560, 364, 60],
            [720, 372, 80],
          ].map(([x, y, w], i) => (
            <ellipse key={`sheen-${i}`} cx={x} cy={y} rx={w} ry="2.5" fill="#b4d2ca" opacity=".2" />
          ))}
          {[340, 352, 366, 382, 400, 420].map((y, i) => (
            <ellipse key={`glint-${y}`} cx={805 + (noise(i, 113) - 0.5) * 8} cy={y} rx={18 - i * 2} ry="2.2" fill="#ffd9a0" opacity={0.42 - i * 0.05} />
          ))}
          {[
            [250, 420, 34],
            [880, 470, 40],
            [520, 500, 30],
            [690, 372, 24],
            [1050, 400, 26],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y} rx={r} ry={r * 0.32} fill="#2f5a3a" />
              <path d={`M${x} ${y}L${x + r * 0.9} ${y - r * 0.1}`} stroke="#173634" strokeWidth="3" />
              {i % 2 === 0 && <circle cx={x - r * 0.4} cy={y - r * 0.12} r={r * 0.18} fill="#f1c6d3" />}
            </g>
          ))}
          <Egret x={440} y={478} />
        </svg>
      </div>

      {/* Ronds de pluie sur l'étang, koi sous l'eau */}
      <div className="sy-pond" aria-hidden="true">
        {RIPPLES.slice(0, ripples).map((r, i) => (
          <i key={i} className="arena-prop sy-ripple" style={{ ["--px" as string]: r.x - 30, ["--py" as string]: r.y - 9, ["--pw" as string]: 60, ["--ph" as string]: 18, animationDuration: `${r.d}s`, animationDelay: `${r.delay}s` }} />
        ))}
        {level !== "reduced" &&
          [0, 1, 2].map((k) => (
            <span key={k} className={`arena-prop sy-koi sy-koi-${k}`} style={{ ["--px" as string]: 430 + k * 120, ["--py" as string]: 376 + k * 44, ["--pw" as string]: 84, ["--ph" as string]: 29 }}>
              <svg viewBox="0 0 70 24">
                <path d="M6 12C14 2 40 2 52 10L66 4L62 12L66 20L52 14C40 22 14 22 6 12Z" fill={k === 1 ? "#f3ecdf" : "#e0533f"} />
                {k !== 1 && <path d="M20 8c6-2 12 0 14 4-4 3-10 3-14-4z" fill="#f3ecdf" />}
                {k === 1 && <path d="M18 9c5-3 10-2 12 2-3 3-8 3-12-2z" fill="#c8372d" />}
              </svg>
            </span>
          ))}
        <span ref={leap} className="arena-prop sy-leap" style={{ ["--px" as string]: 520, ["--py" as string]: 440, ["--pw" as string]: 90, ["--ph" as string]: 32 }}>
          <svg viewBox="0 0 70 24">
            <path d="M6 12C14 2 40 2 52 10L66 4L62 12L66 20L52 14C40 22 14 22 6 12Z" fill="#e0533f" />
            <path d="M20 8c6-2 12 0 14 4-4 3-10 3-14-4z" fill="#f3ecdf" />
            <circle cx="14" cy="10" r="1.6" fill="#15120f" />
          </svg>
        </span>
      </div>

      {/* Rive proche : dalles mouillées, mousse, hortensias, lanterne yukimi */}
      <div ref={near} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g filter={`url(#${u}-rough)`}>
            <path d="M0 586C200 572 400 580 600 576C820 572 1000 584 1200 574V900H0Z" fill={`url(#${u}-bank)`} />
            {Array.from({ length: 16 }, (_, i) => {
              const x = (i / 15) * 1200 + (noise(i, 81) - 0.5) * 50;
              const y = 610 + noise(i, 83) * 250;
              const w = 60 + noise(i, 87) * 70;
              return <ellipse key={i} cx={x} cy={y} rx={w} ry={w * 0.22} fill={i % 3 ? "#3a4a48" : "#2f3e3c"} opacity=".9" />;
            })}
            {Array.from({ length: 14 }, (_, i) => (
              <ellipse key={`h${i}`} cx={(i / 13) * 1200 + (noise(i, 91) - 0.5) * 60} cy={604 + noise(i, 93) * 220} rx={18 + noise(i, 97) * 22} ry="3" fill="#cfe3e0" opacity=".2" />
            ))}
            <Hydrangea x={380} y={600} r={52} hue={BLUE} salt={1} />
            <Hydrangea x={830} y={610} r={58} hue={VIOLET} salt={2} />
            <Hydrangea x={120} y={640} r={70} hue={VIOLET} salt={3} />
            <Hydrangea x={1090} y={650} r={74} hue={BLUE} salt={4} />
            <Hydrangea x={452} y={742} r={40} hue={BLUE} salt={5} />
            <Hydrangea x={748} y={748} r={44} hue={VIOLET} salt={6} />
            {/* Lanterne yukimi : large chapeau, trois pieds */}
            <path d="M232 600c8-30 10-50 6-70M262 604c2-30 0-50-4-72M292 600c-6-30-8-50-4-70" stroke="#4e5c5a" strokeWidth="9" fill="none" strokeLinecap="round" />
            <rect x="236" y="500" width="54" height="34" fill="#5e6c6a" />
            <rect x="248" y="508" width="30" height="18" fill="#ffd9a0" opacity=".75" />
            <path d="M190 504C220 470 310 470 336 504Z" fill="#4a5856" />
            <path d="M256 474c6-8 6-14 0-20-6 6-6 12 0 20z" fill="#4a5856" />
          </g>
        </svg>
      </div>

      {/* Rideaux de pluie (lointain fin, proche plus marqué), éclaircie, éclair */}
      <div ref={sun} className="sy-sun" aria-hidden="true" />
      <div ref={rain} className="sy-rain" aria-hidden="true">
        {level !== "reduced" && <span className="sy-rain-far" />}
        {level === "full" && <span className="sy-rain-near" />}
      </div>
      <Haze tone="rgb(180 210 200 / .16)" top="24%" height="24%" opacity={0.9} />

      <div ref={edges} className="arena-edges">
        <svg className="sy-willow arena-near" viewBox="0 0 260 300" aria-hidden="true">
          <path d="M-10 6C40 2 120 4 270 -4" stroke="#16221c" strokeWidth="9" fill="none" />
          {WILLOW.map((w, i) => (
            <g key={i}>
              <path d={w.d} stroke="#1f3a2c" strokeWidth="1.6" fill="none" />
              <path d={w.d} stroke={w.tone} strokeWidth="3.5" fill="none" strokeDasharray="4 5" strokeLinecap="round" />
            </g>
          ))}
        </svg>
        <svg className="sy-maple arena-near" viewBox="0 0 320 180" aria-hidden="true">
          <path d="M330 20C260 30 200 60 150 100C120 124 80 132 40 128" stroke="#16221c" strokeWidth="8" fill="none" />
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              transform={`translate(${40 + i * 20} ${50 + Math.sin(i) * 34}) rotate(${i * 41}) scale(${0.8 + (i % 3) * 0.18})`}
              d="M0-14l3 8 8-4-3 9 9 2-8 5 4 7-8-2-1 9-5-7-5 7-1-9-8 2 4-7-8-5 9-2-3-9 8 4z"
              fill={["#2f6b52", "#3a7a5c", "#245a44"][i % 3]}
            />
          ))}
        </svg>
      </div>

      <div ref={flash} className="sy-flash" aria-hidden="true" />
      <Grain />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
