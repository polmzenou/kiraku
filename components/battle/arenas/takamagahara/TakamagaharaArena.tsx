"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { Grain, Haze, moteStyle, OrganicDefs, particles, play, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./takamagahara.css";

// Le Palais céleste (高天原), arène du palier Grand champion : une plate-forme incrustée de nacre
// au-dessus d'une mer de nuages, à l'aube. Palais lointain, grues, voiles hagoromo et hō-ō (silhouette
// originale) sont dessinés pour Kiraku ; nuages, halo, reflets de nacre et vols sont des calques animés.

/** Nuage en grappe de lobes (dessus bombé, base plate). */
function Cloud({ x, y, w, tone, salt }: { x: number; y: number; w: number; tone: string; salt: number }) {
  const n = 6;
  return (
    <g fill={tone}>
      {Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const r = w * (0.12 + noise(i + salt, 3) * 0.08) * (1 - Math.abs(t - 0.5) * 0.9);
        return <circle key={i} cx={x - w / 2 + w * t} cy={y - r * 0.6} r={r} />;
      })}
      <ellipse cx={x} cy={y} rx={w / 2} ry={w * 0.08} />
    </g>
  );
}

/** Pavillon céleste lointain : trois toits recourbés empilés, fût de colonnes. */
function Pavilion({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#3a2a66">
      {[0, 1, 2].map((k) => {
        const w = 120 - k * 30;
        const yy = -k * 46;
        return (
          <g key={k}>
            <rect x={-w * 0.32} y={yy - 30} width={w * 0.64} height="30" fill="#4a3a7a" />
            <path d={`M${-w / 2 - 14} ${yy - 30}Q0 ${yy - 44} ${w / 2 + 14} ${yy - 30}L${w / 2 - 4} ${yy - 40}H${-w / 2 + 4}Z`} />
            <path d={`M${-w / 2 - 14} ${yy - 30}l-6-6M${w / 2 + 14} ${yy - 30}l6-6`} stroke="#d9b556" strokeWidth="2" />
          </g>
        );
      })}
      <path d="M0-180V-150" stroke="#d9b556" strokeWidth="3" />
    </g>
  );
}

export function TakamagaharaArena({ level, handleRef, sound }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const floor = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLDivElement>(null);
  const phoenix = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.2 },
      { ref: floor, depth: 0.6 },
      { ref: edges, depth: 1.5 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "turn":
          play(sound, "chime");
          break;
        case "crit":
          pulse(beam.current, [{ opacity: 0, transform: "scaleX(.4)" }, { opacity: 1, transform: "scaleX(1)", offset: 0.25 }, { opacity: 0, transform: "scaleX(1.3)" }], { duration: 1_300 });
          break;
        case "ko":
          shower(fx.current, "tk-feather", particles(level, 14), { from: [0.1, 0.9], y0: -0.04, fall: 0.9, drift: 0.3, duration: 3_400, spin: 420 });
          break;
        case "technique":
          pulse(halo.current, [{ opacity: 0.7 }, { opacity: 1, offset: 0.3 }, { opacity: 0.7 }], { duration: 1_200 });
          break;
        case "victory":
          pulse(phoenix.current, [
            { transform: "translate(-120%, 30%) scale(.8)", opacity: 0 },
            { transform: "translate(-40%, 0%) scale(1)", opacity: 1, offset: 0.25 },
            { transform: "translate(60%, -20%) scale(1.05)", opacity: 1, offset: 0.75 },
            { transform: "translate(140%, -30%) scale(.9)", opacity: 0 },
          ], { duration: 3_600, easing: "cubic-bezier(.4,.1,.5,1)" });
          pulse(halo.current, [{ opacity: 0.7 }, { opacity: 1 }], { duration: 1_600, fill: "forwards" });
          play(sound, "chime");
          break;
        case "defeat":
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 1_600, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const motes = particles(level, 22);

  return (
    <div className="arena arena-takamagahara" data-level={level}>
      <OrganicDefs id={u} />
      <div ref={far} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#100822" />
              <stop offset=".16" stopColor="#2e1f52" />
              <stop offset=".28" stopColor="#6b4f9e" />
              <stop offset=".36" stopColor="#b7a3e0" />
              <stop offset=".42" stopColor="#efe6f8" />
            </linearGradient>
            <radialGradient id={`${u}-disc`} cx="45%" cy="40%" r="60%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".6" stopColor="#f6f0ff" />
              <stop offset=".85" stopColor="#e8d8f6" />
              <stop offset="1" stopColor="#c9dcf3" />
            </radialGradient>
          </defs>
          <rect width="1200" height="900" fill={`url(#${u}-sky)`} />
          <circle cx="600" cy="170" r="104" fill={`url(#${u}-disc)`} />
          <g filter={`url(#${u}-rough)`}>
            <Pavilion x={250} y={300} s={0.9} />
            <Pavilion x={960} y={290} s={0.75} />
            <Cloud x={250} y={300} w={360} tone="#d4c6f0" salt={1} />
            <Cloud x={960} y={292} w={320} tone="#d4c6f0" salt={2} />
            <Cloud x={600} y={330} w={520} tone="#e8e1f5" salt={3} />
            <Cloud x={100} y={350} w={300} tone="#e8e1f5" salt={4} />
            <Cloud x={1100} y={346} w={300} tone="#e8e1f5" salt={5} />
          </g>
        </svg>
      </div>

      {/* Halo tournant derrière le disque, vols de grues, voiles hagoromo */}
      <div ref={halo} className="arena-prop tk-halo" style={{ ["--px" as string]: 380, ["--py" as string]: -50, ["--pw" as string]: 440, ["--ph" as string]: 440 }} aria-hidden="true" />
      {level !== "reduced" && (
        <>
          <div className="arena-prop tk-cranes" style={{ ["--px" as string]: 0, ["--py" as string]: 60, ["--pw" as string]: 300, ["--ph" as string]: 110 }} aria-hidden="true">
            {[
              [0, 50],
              [50, 30],
              [50, 70],
              [100, 12],
              [100, 88],
            ].map(([x, y], i) => (
              <span key={i} className="tk-crane" style={{ left: `${x / 3}%`, top: `${y}%`, animationDelay: `${-i * 0.18}s` }}>
                <svg viewBox="0 0 60 30">
                  <path d="M28 16C22 14 12 6 2 8C12 12 20 16 26 20Z" fill="#f6f0ff" className="tk-wing" />
                  <path d="M32 16C38 14 48 6 58 8C48 12 40 16 34 20Z" fill="#f6f0ff" className="tk-wing" />
                  <path d="M20 18C26 16 36 16 44 18L52 16L46 20C38 22 28 22 20 18Z" fill="#f8f2e4" />
                  <circle cx="50" cy="16.5" r="1.6" fill="#c8372d" />
                </svg>
              </span>
            ))}
          </div>
          {["a", "b"].map((k) => (
            <div key={k} className={`arena-prop tk-ribbon tk-ribbon-${k}`} style={{ ["--px" as string]: k === "a" ? 120 : 640, ["--py" as string]: k === "a" ? 120 : 70, ["--pw" as string]: 440, ["--ph" as string]: 120 }} aria-hidden="true">
              <svg viewBox="0 0 440 120" preserveAspectRatio="none">
                <path d="M0 60C80 10 140 110 220 60S360 10 440 60L440 74C360 24 300 124 220 74S80 24 0 74Z" fill={k === "a" ? "#f1d6ec" : "#d4c6f0"} opacity=".75" />
              </svg>
            </div>
          ))}
        </>
      )}
      <div ref={beam} className="tk-beam" aria-hidden="true" />

      {/* Mer de nuages qui dérive sous la plate-forme */}
      <div className="tk-sea" aria-hidden="true">
        <span className="tk-sea-a" />
        <span className="tk-sea-b" />
      </div>

      {/* Plate-forme de nacre, liseré d'or */}
      <div ref={floor} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-nacre`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8e1f5" />
              <stop offset=".3" stopColor="#c9dcf3" />
              <stop offset=".55" stopColor="#f6e6f2" />
              <stop offset=".8" stopColor="#d4c6f0" />
              <stop offset="1" stopColor="#bfe0ea" />
            </linearGradient>
            <pattern id={`${u}-tiles`} width="64" height="37" patternUnits="userSpaceOnUse" patternTransform="scale(1 .55)">
              <path d="M32 0L64 18.5L32 37L0 18.5Z" fill="none" stroke="#9a86c8" strokeWidth="1.4" opacity=".5" />
            </pattern>
          </defs>
          <g filter={`url(#${u}-fine)`}>
            <path d="M180 392C380 376 820 376 1020 392L1180 900H20Z" fill={`url(#${u}-nacre)`} />
            <path d="M180 392C380 376 820 376 1020 392L1180 900H20Z" fill={`url(#${u}-tiles)`} />
            <path d="M180 392C380 376 820 376 1020 392" stroke="#d9b556" strokeWidth="6" fill="none" />
            <path d="M180 392L20 900M1020 392L1180 900" stroke="#b8902f" strokeWidth="8" />
            {Array.from({ length: 18 }, (_, i) => (
              <ellipse key={i} cx={200 + noise(i, 61) * 800} cy={420 + noise(i, 63) * 440} rx={14 + noise(i, 67) * 40} ry={3 + noise(i, 69) * 6} fill="#ffffff" opacity=".35" />
            ))}
          </g>
        </svg>
      </div>
      <div className="arena-prop tk-shimmer" style={{ ["--px" as string]: 100, ["--py" as string]: 380, ["--pw" as string]: 1000, ["--ph" as string]: 520 }} aria-hidden="true" />

      {/* Pétales de lumière */}
      <div className="tk-motes" aria-hidden="true">
        {Array.from({ length: motes }, (_, i) => (
          <span key={i} className="tk-mote" style={moteStyle(i, 41, { x: [4, 96], y: [10, 80] }, [8, 15], [3, 6])} />
        ))}
      </div>
      <Haze tone="rgb(246 240 255 / .22)" top="34%" height="18%" opacity={0.9} />

      {/* Le hō-ō de la victoire : longues plumes de queue, ailes déployées */}
      <div ref={phoenix} className="arena-prop tk-phoenix" style={{ ["--px" as string]: 300, ["--py" as string]: 60, ["--pw" as string]: 600, ["--ph" as string]: 260 }} aria-hidden="true">
        <svg viewBox="0 0 600 260">
          <path d="M300 120C250 70 180 40 90 40C160 70 210 100 250 140Z" fill="#f6e6f2" />
          <path d="M300 120C350 60 430 20 560 16C470 60 400 100 350 140Z" fill="#f6e6f2" />
          <path d="M260 140C300 120 340 124 360 140C340 156 300 160 260 140Z" fill="#ffffff" />
          <path d="M360 140C380 132 396 132 406 138C396 146 380 148 360 140Z" fill="#d9b556" />
          <path d="M260 146C200 180 120 196 20 236M262 150C210 200 150 228 70 256M270 150C240 210 210 240 150 260" stroke="#d4c6f0" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M260 146C200 180 120 196 20 236" stroke="#d9b556" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* Abords : nuages au premier plan, flous */}
      <div ref={edges} className="arena-edges">
        <svg className="tk-front arena-near" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <Cloud x={120} y={200} w={420} tone="#f6f0ff" salt={7} />
          <Cloud x={1080} y={206} w={460} tone="#efe6f8" salt={8} />
          <Cloud x={600} y={224} w={700} tone="#e8e1f5" salt={9} />
        </svg>
      </div>

      <Grain strength={0.7} />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
    </div>
  );
}
