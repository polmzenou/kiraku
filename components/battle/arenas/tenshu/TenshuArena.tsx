"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { Grain, Haze, OrganicDefs, particles, play, pulse, shower, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./tenshu.css";

// Le Donjon dans la tempête (嵐の天守閣), arène du palier Élite : la galerie d'une tourelle, la nuit,
// face au donjon sous l'orage. Donjon, shachihoko, galerie et bannières sont dessinés pour Kiraku ;
// nuages, éclairs, pluie, éclaboussures et bannières qui claquent sont des calques animés. Sur
// téléphone, le faîte et ses shachihoko tiennent dans la bande de ciel au-dessus des cartes adverses.

/** Pan de toit recourbé à tuiles (kawara) des tourelles latérales : la courbe du faîte et les rangs de tuiles. */
function Roof({ x0, x1, y, h, flip = false }: { x0: number; x1: number; y: number; h: number; flip?: boolean }) {
  const w = x1 - x0;
  const lift = flip ? -1 : 1;
  const edge = `M${x0} ${y}Q${x0 + w * 0.5} ${y + h * 0.18} ${x1} ${y - h * 0.22 * lift}`;
  return (
    <g>
      <path d={`${edge}L${x1} ${y + h}H${x0}Z`} fill="#141b2c" />
      {Array.from({ length: 9 }, (_, i) => {
        const t = (i + 1) / 10;
        return <path key={i} d={`M${x0 + w * t} ${y + h * 0.05}L${x0 + w * t + (flip ? -1 : 1) * w * 0.04} ${y + h}`} stroke="#222b40" strokeWidth="3" opacity=".9" />;
      })}
      {[0.3, 0.55, 0.8].map((t) => (
        <path key={t} d={`M${x0} ${y + h * t}Q${x0 + w * 0.5} ${y + h * (t + 0.12)} ${x1} ${y + h * (t - 0.2)}`} stroke="#0c1120" strokeWidth="2.5" fill="none" />
      ))}
      <path d={edge} stroke="#3a4a6a" strokeWidth="5" fill="none" />
      <path d={edge} stroke="#9fb4d8" strokeWidth="1.5" fill="none" opacity=".5" />
    </g>
  );
}

/** Toit d'un étage du donjon vu de face : versant de tuiles du haut à l'avant-toit, coins relevés (sori). */
function Tier({ cx = 600, top, w0, w1, h, lift }: { cx?: number; top: number; w0: number; w1: number; h: number; lift: number }) {
  const y1 = top + h;
  const l0 = cx - w0;
  const r0 = cx + w0;
  const l1 = cx - w1;
  const r1 = cx + w1;
  const spread = (w1 - w0) * 0.45;
  const eave = `M${r1 + 12} ${y1 - lift}Q${cx} ${y1 + 12} ${l1 - 12} ${y1 - lift}`;
  const rows = Math.round((w1 * 2) / 15);
  return (
    <g>
      <path
        d={`M${l0} ${top}H${r0}C${r0 + spread} ${top + h * 0.6} ${r1 - 8} ${y1 - lift * 0.3} ${r1 + 12} ${y1 - lift}L${r1 - 4} ${y1 + 9}Q${cx} ${y1 + 20} ${l1 + 4} ${y1 + 9}L${l1 - 12} ${y1 - lift}C${l1 + 8} ${y1 - lift * 0.3} ${l0 - spread} ${top + h * 0.6} ${l0} ${top}Z`}
        fill="#141b2c"
      />
      {Array.from({ length: rows - 1 }, (_, i) => {
        const t = (i + 1) / rows;
        return <path key={i} d={`M${(l0 + (r0 - l0) * t).toFixed(1)} ${top + 2}L${(l1 + (r1 - l1) * t).toFixed(1)} ${y1 - 4}`} stroke="#222b40" strokeWidth="2.5" opacity={0.65 + noise(i, top) * 0.35} />;
      })}
      <path d={`${eave}L${l1 + 4} ${y1 + 9}Q${cx} ${y1 + 20} ${r1 - 4} ${y1 + 9}Z`} fill="#0b0f1a" />
      <path d={eave} stroke="#3a4a6a" strokeWidth="5" fill="none" />
      <path d={eave} stroke="#9fb4d8" strokeWidth="1.5" fill="none" opacity=".5" />
    </g>
  );
}

/** Shachihoko d'or : poisson-tigre la tête sur le faîte, gueule ouverte, le corps cambré et la queue fourchue dressée. */
function Shachi({ x, y, s, flip = false }: { x: number; y: number; s: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d="M-4 -26L-15 -27L-9 -33L-18 -38L-8 -41L-14 -48L-3 -48Z" fill="#b8902f" />
      <path d="M0 0C-8 -14 -10 -34 -2 -50C4 -60 12 -66 20 -68L26 -62C18 -58 14 -50 16 -42C18 -34 24 -28 32 -26C40 -25 46 -22 48 -17L38 -13L46 -8C40 -2 28 2 14 2C8 2 3 1 0 0Z" fill="#d9b556" />
      <path d="M20 -68C22 -80 30 -88 40 -90C34 -82 32 -76 34 -72C40 -76 46 -76 52 -72C42 -70 34 -66 26 -62Z" fill="#f2d88a" />
      <path d="M-4 -44C0 -54 8 -62 18 -66" stroke="#f2d88a" strokeWidth="2" fill="none" opacity=".9" />
      <path d="M2 -14q5-4 10 0M0 -24q5-4 10 0M2 -34q5-4 10 0M6 -44q4-4 8 0" stroke="#8a6a1f" strokeWidth="1.6" fill="none" />
      <path d="M20 -4C15 -11 8 -13 3 -11C9 -7 13 -4 20 -4Z" fill="#b8902f" />
      <path d="M38 -13L48 -17M38 -13L46 -8" stroke="#3b2805" strokeWidth="1.6" fill="none" />
      <path d="M26 -22C29 -25 33 -25 35 -23" stroke="#8a6a1f" strokeWidth="1.6" fill="none" />
      <circle cx="31" cy="-19" r="2.1" fill="#3b2805" />
    </g>
  );
}

/** Fenêtre en cloche (katōmado) : son contour, centré en x, du haut y sur la hauteur h. */
const bell = (x: number, y: number, w: number, h: number) =>
  `M${x - w} ${y + h}V${y + h * 0.42}C${x - w} ${y + h * 0.16} ${x - w * 0.4} ${y} ${x} ${y}C${x + w * 0.4} ${y} ${x + w} ${y + h * 0.16} ${x + w} ${y + h * 0.42}V${y + h}Z`;

const LOW_WINDOWS = [456, 504, 552, 648, 696, 744];

/** Le donjon en face : socle de pierre, trois étages de toits, pignons chidori et kara, fenêtres allumées. */
function Keep() {
  return (
    <g>
      <path d="M410 336H790C800 360 816 382 842 396H358C384 382 400 360 410 336Z" fill="#1a2132" />
      {[348, 362, 378].map((y, j) => (
        <path key={y} d={`M${404 - j * 8} ${y}C${500} ${y + (noise(j, 3) - 0.5) * 4} ${700} ${y + (noise(j, 5) - 0.5) * 4} ${796 + j * 8} ${y}`} stroke="#0e1320" strokeWidth="2" fill="none" />
      ))}
      {/* Étage bas : enduit, soubassement de planches noires */}
      <rect x="432" y="246" width="336" height="58" fill="#3a445e" />
      <rect x="432" y="284" width="336" height="20" fill="#0f1320" />
      {Array.from({ length: 21 }, (_, i) => (
        <path key={i} d={`M${440 + i * 16} 285V304`} stroke="#1c2234" strokeWidth="1.5" />
      ))}
      {LOW_WINDOWS.map((x, i) => (
        <rect key={x} x={x - 8} y="266" width="16" height="13" fill={noise(i, 17) > 0.35 ? "#ffd9a0" : "#1a2030"} opacity={noise(i, 17) > 0.35 ? 0.55 + noise(i, 19) * 0.35 : 1} />
      ))}
      {/* Dernier étage : fenêtres en cloche */}
      <rect x="486" y="152" width="228" height="58" fill="#46516e" />
      {[520, 600, 680].map((x, i) => (
        <path key={x} d={bell(x, 178, 10, 24)} fill="#ffd9a0" opacity={0.6 + noise(i, 23) * 0.3} />
      ))}
      <Tier top={300} w0={170} w1={252} h={34} lift={20} />
      <Tier top={208} w0={128} w1={198} h={38} lift={18} />
      {/* Pignon triangulaire (chidori-hafu) et son ornement d'or */}
      <path d="M538 250L600 196L662 250Z" fill="#141b2c" />
      <path d="M558 246L600 210L642 246Z" fill="#3e4864" />
      <rect x="592" y="228" width="16" height="13" fill="#ffd9a0" opacity=".8" />
      <path d="M538 250L600 196L662 250" stroke="#3a4a6a" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <path d="M538 250L600 196L662 250" stroke="#9fb4d8" strokeWidth="1.4" fill="none" opacity=".45" strokeLinejoin="round" />
      <path d="M593 206C593 199 600 197 600 201C600 197 607 199 607 206C604 210 596 210 593 206Z" fill="#d9b556" />
      <Tier top={124} w0={102} w1={150} h={34} lift={16} />
      {/* Pignon courbe (karahafu) liseré d'or */}
      <path d="M556 162C570 160 584 152 590 142C594 136 597 134 600 134C603 134 606 136 610 142C616 152 630 160 644 162Z" fill="#0f1424" />
      <path d="M556 162C570 160 584 152 590 142C594 136 597 134 600 134C603 134 606 136 610 142C616 152 630 160 644 162" stroke="#d9b556" strokeWidth="2.5" fill="none" opacity=".85" />
      {/* Faîte et shachihoko */}
      <path d="M494 126C540 122 660 122 706 126V116C660 113 540 113 494 116Z" fill="#0f1424" />
      <path d="M494 116C540 113 660 113 706 116" stroke="#3a4a6a" strokeWidth="3" fill="none" />
      <Shachi x={506} y={117} s={0.74} />
      <Shachi x={694} y={117} s={0.74} flip />
    </g>
  );
}

/** Tourelle d'angle (yagura) à deux toits, vue sur grand écran de part et d'autre du donjon. */
function Turret({ cx, salt }: { cx: number; salt: number }) {
  return (
    <g>
      <path d={`M${cx - 120} 338H${cx + 120}C${cx + 128} 360 ${cx + 140} 382 ${cx + 160} 396H${cx - 160}C${cx - 140} 382 ${cx - 128} 360 ${cx - 120} 338Z`} fill="#161c2b" />
      <Tier cx={cx} top={306} w0={110} w1={160} h={26} lift={14} />
      <rect x={cx - 110} y="246" width="220" height="60" fill="#38425b" />
      <rect x={cx - 110} y="288" width="220" height="18" fill="#0f1320" />
      {[-80, -40, 0, 40, 80].map((dx, i) => (
        <rect key={dx} x={cx + dx - 7} y="262" width="14" height="13" fill={noise(i, salt) > 0.4 ? "#ffd9a0" : "#1a2030"} opacity={noise(i, salt) > 0.4 ? 0.5 + noise(i, salt + 1) * 0.35 : 1} />
      ))}
      <Tier cx={cx} top={214} w0={70} w1={128} h={32} lift={14} />
      <path d={`M${cx - 74} 216C${cx - 40} 212 ${cx + 40} 212 ${cx + 74} 216V206C${cx + 40} 203 ${cx - 40} 203 ${cx - 74} 206Z`} fill="#0f1424" />
      <Shachi x={cx - 66} y={207} s={0.42} />
      <Shachi x={cx + 66} y={207} s={0.42} flip />
    </g>
  );
}

const BOARDS = Array.from({ length: 21 }, (_, i) => i - 10);
const LIGHTS = Array.from({ length: 46 }, (_, i) => ({ x: noise(i, 3) * 1200, y: 292 + noise(i, 5) ** 1.6 * 46, r: 0.8 + noise(i, 7) * 1.8 }));
const POSTS = Array.from({ length: 15 }, (_, i) => 40 + i * 80 + (noise(i, 13) - 0.5) * 8);
/** Reflets sur les planches mouillées : les shachihoko (or) et les fenêtres allumées (chaud). */
const STREAKS = [
  { x: 534, w: 12, gold: true },
  { x: 666, w: 12, gold: true },
  { x: 520, w: 6, gold: false },
  { x: 600, w: 8, gold: false },
  { x: 680, w: 6, gold: false },
  { x: 456, w: 5, gold: false },
  { x: 744, w: 5, gold: false },
] as const;
const SPLASHES = Array.from({ length: 16 }, (_, i) => ({
  x: (i % 4 ? 380 : 120) + noise(i, 51) * (i % 4 ? 440 : 960),
  y: i % 2 ? 398 + noise(i, 53) * 100 : 688 + noise(i, 53) * 90,
  d: 1.3 + noise(i, 57) * 1.1,
  delay: -noise(i, 59) * 2.4,
}));

export function TenshuArena({ level, handleRef, sound }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const floor = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const bolts = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.25 },
      { ref: floor, depth: 0.6 },
      { ref: edges, depth: 1.5 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "turn":
          // Tambour de guerre ; les bannières claquent
          edges.current?.querySelectorAll(".ts-banner").forEach((b, i) => pulse(b, [{ transform: "skewY(0deg) scaleX(1)" }, { transform: "skewY(-6deg) scaleX(.9)", offset: 0.3 }, { transform: "skewY(3deg) scaleX(1.04)", offset: 0.65 }, { transform: "skewY(0deg) scaleX(1)" }], { duration: 700, delay: i * 60, composite: "add" }));
          play(sound, "drum");
          break;
        case "crit":
          // La foudre tombe sur le faîte : l'éclair dessiné, la lueur du ciel (deux pulsations, sous le seuil), le tonnerre
          pulse(bolts.current?.querySelector(".ts-bolt-strike"), [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 0.2, offset: 0.16 }, { opacity: 0.9, offset: 0.26 }, { opacity: 0 }], { duration: 650, easing: "linear" });
          pulse(flash.current, [{ opacity: 0 }, { opacity: 0.45, offset: 0.06 }, { opacity: 0.05, offset: 0.18 }, { opacity: 0.3, offset: 0.28 }, { opacity: 0 }], { duration: 650, easing: "linear" });
          play(sound, "thunder");
          break;
        case "ko":
          // Des tuiles se brisent et tombent du toit
          shower(fx.current, "ts-tile", particles(level, 6), { from: [0.05, 0.3], y0: 0.12, fall: 0.8, drift: 0.12, duration: 1_400, spin: 260 });
          shower(fx.current, "ts-tile", particles(level, 6), { from: [0.7, 0.95], y0: 0.12, fall: 0.8, drift: 0.12, duration: 1_400, spin: 260, delay: 120 });
          break;
        case "victory":
          pulse(beam.current, [{ opacity: 0 }, { opacity: 0.9 }], { duration: 2_000, fill: "forwards" });
          pulse(rain.current, [{ opacity: 0.8 }, { opacity: 0.2 }], { duration: 2_000, fill: "forwards" });
          break;
        case "defeat":
          pulse(rain.current, [{ opacity: 0.8 }, { opacity: 1 }], { duration: 1_000, fill: "forwards" });
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 1_600, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const splashes = particles(level, SPLASHES.length);

  return (
    <div className="arena arena-tenshu" data-level={level}>
      <OrganicDefs id={u} />
      {/* Ciel d'orage, ville en contrebas, nuages qui filent, lueur d'éclair, puis le donjon */}
      <div ref={far} className="arena-plane">
        <svg className="arena-svg arena-layer" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#060a1e" />
              <stop offset=".2" stopColor="#111c40" />
              <stop offset=".33" stopColor="#1f2e5e" />
              <stop offset=".38" stopColor="#29386a" />
            </linearGradient>
            <radialGradient id={`${u}-break`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#5a72b8" stopOpacity=".5" />
              <stop offset=".6" stopColor="#3a4f8e" stopOpacity=".2" />
              <stop offset="1" stopColor="#3a4f8e" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1200" height="900" fill={`url(#${u}-sky)`} />
          <ellipse cx="600" cy="170" rx="470" ry="210" fill={`url(#${u}-break)`} />
          <g filter={`url(#${u}-rough)`}>
            <path d="M0 300C80 262 150 250 230 268C300 240 360 232 430 262C500 250 560 270 600 282C660 262 720 246 800 266C880 238 960 244 1040 270C1110 256 1160 262 1200 276V340H0Z" fill="#0d142c" />
            <path d="M0 330C200 312 400 322 600 318C800 314 1000 324 1200 318V360H0Z" fill="#0a1024" />
            {LIGHTS.map((l, i) => (
              <circle key={i} cx={l.x} cy={l.y} r={l.r} fill={i % 4 ? "#ffd9a0" : "#f2d88a"} opacity={0.35 + noise(i, 9) * 0.4} />
            ))}
          </g>
        </svg>
        <div className="ts-clouds" aria-hidden="true">
          <span className="ts-cloud ts-cloud-far" />
          <span className="ts-cloud ts-cloud-near" />
        </div>
        <div className="arena-prop ts-sheet" style={{ ["--px" as string]: 150, ["--py" as string]: -60, ["--pw" as string]: 900, ["--ph" as string]: 520 }} aria-hidden="true" />
        <svg className="arena-svg arena-layer" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g filter={`url(#${u}-rough)`}>
            {/* Toits bas des remparts, puis les tourelles de part et d'autre */}
            <Roof x0={-80} x1={260} y={318} h={50} />
            <Roof x0={940} x1={1280} y={318} h={50} flip />
            <Turret cx={170} salt={71} />
            <Turret cx={1030} salt={73} />
            <Keep />
          </g>
        </svg>
        <div ref={bolts} className="arena-prop ts-bolts" style={{ ["--px" as string]: 0, ["--py" as string]: 0, ["--pw" as string]: 1200, ["--ph" as string]: 450 }} aria-hidden="true">
          <svg viewBox="0 0 1200 450" className="ts-bolt ts-bolt-idle">
            <path d="M800 -10L782 40L806 52L774 104L794 112L768 170M190 -10L174 56L204 74L158 150L186 162L140 250" stroke="#c9dcf3" strokeWidth="9" opacity=".35" fill="none" strokeLinejoin="round" />
            <path d="M800 -10L782 40L806 52L774 104L794 112L768 170M190 -10L174 56L204 74L158 150L186 162L140 250" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinejoin="round" />
          </svg>
          <svg viewBox="0 0 1200 450" className="ts-bolt ts-bolt-strike">
            <path d="M652 -10L632 30L660 46L626 84L646 92L612 122M660 46L700 66L716 92M626 84L590 100" stroke="#c9dcf3" strokeWidth="14" opacity=".4" fill="none" strokeLinejoin="round" />
            <path d="M652 -10L632 30L660 46L626 84L646 92L612 122M660 46L700 66L716 92M626 84L590 100" stroke="#ffffff" strokeWidth="4" fill="none" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div ref={beam} className="ts-beam" aria-hidden="true" />

      {/* Galerie de la tourelle : garde-corps du fond, planches mouillées, reflets et flaques */}
      <div ref={floor} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-deck`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#262b3c" />
              <stop offset=".5" stopColor="#2b3042" />
              <stop offset="1" stopColor="#161923" />
            </linearGradient>
            <linearGradient id={`${u}-gold`} gradientUnits="userSpaceOnUse" x1="0" y1="388" x2="0" y2="490">
              <stop offset="0" stopColor="#d9b556" stopOpacity=".5" />
              <stop offset="1" stopColor="#d9b556" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${u}-warm`} gradientUnits="userSpaceOnUse" x1="0" y1="388" x2="0" y2="470">
              <stop offset="0" stopColor="#ffd9a0" stopOpacity=".34" />
              <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g filter={`url(#${u}-fine)`}>
            <path d="M40 384H1160L1320 900H-120Z" fill={`url(#${u}-deck)`} />
            {BOARDS.map((k) => (
              <path key={k} d={`M${600 + k * 56 + (noise(k + 20, 3) - 0.5) * 4} 384L${600 + k * 136 + (noise(k + 20, 5) - 0.5) * 20} 900`} stroke="#0c0e16" strokeWidth={1.6 + noise(k + 20, 7)} opacity=".8" />
            ))}
            <ellipse cx="600" cy="414" rx="380" ry="26" fill="#5a72b8" opacity=".14" />
            {STREAKS.map((s) => (
              <path key={s.x} d={`M${s.x} 390V${s.gold ? 488 : 468}`} stroke={`url(#${u}-${s.gold ? "gold" : "warm"})`} strokeWidth={s.w} strokeDasharray={`${7 + noise(s.x, 3) * 6} 3 ${4 + noise(s.x, 5) * 5} 4`} />
            ))}
            {[
              [480, 560, 90],
              [760, 680, 120],
              [330, 780, 110],
              [646, 466, 64],
            ].map(([x, y, w], i) => (
              <g key={i}>
                <ellipse cx={x} cy={y} rx={w} ry={w * 0.16} fill="#3a4a6a" opacity=".35" />
                <ellipse cx={x - w * 0.2} cy={y - 2} rx={w * 0.5} ry={w * 0.05} fill="#c9dcf3" opacity=".22" />
              </g>
            ))}
          </g>
          <g filter={`url(#${u}-rough)`}>
            <path d="M30 382H1170" stroke="#0e0b0e" strokeWidth="6" />
            {POSTS.map((x) => (
              <path key={x} d={`M${x} 340V384`} stroke="#120e12" strokeWidth="10" />
            ))}
            <path d="M30 364H1170" stroke="#120e12" strokeWidth="5" />
            <path d="M30 344H1170" stroke="#120e12" strokeWidth="10" />
            <path d="M30 339H1170" stroke="#4a3a3a" strokeWidth="2" opacity=".8" />
            {POSTS.filter((_, i) => i % 2 === 0).map((x) => (
              <g key={`g${x}`}>
                <ellipse cx={x} cy="335" rx="9" ry="7" fill="#b8902f" />
                <path d={`M${x - 4} 330c2-8 6-8 8 0`} fill="#f2d88a" />
              </g>
            ))}
          </g>
        </svg>
        {/* Gouttes qui rebondissent sur les planches */}
        {SPLASHES.slice(0, splashes).map((s, i) => (
          <i key={i} className="arena-prop ts-splash" style={{ ["--px" as string]: s.x - 20, ["--py" as string]: s.y - 5, ["--pw" as string]: 40, ["--ph" as string]: 10, animationDuration: `${s.d}s`, animationDelay: `${s.delay}s` }} />
        ))}
      </div>

      <div ref={rain} className="ts-rain" aria-hidden="true">
        {level !== "reduced" && <span className="ts-rain-far" />}
        {level === "full" && <span className="ts-rain-near" />}
      </div>
      <Haze tone="rgb(150 170 220 / .14)" top="26%" height="22%" opacity={0.9} slow={0.6} />

      {/* Abords : bannières nobori qui claquent, garde-corps laqué au premier plan */}
      <div ref={edges} className="arena-edges">
        {["l", "r"].map((side) => (
          <div key={side} className={`ts-pole ts-pole-${side} arena-near`}>
            <span className="ts-banner">
              <svg viewBox="0 0 60 220" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 0H60V220L30 206L0 220Z" fill={side === "l" ? "#c8372d" : "#2c5a86"} />
                <circle cx="30" cy="60" r="18" fill="none" stroke="#f3ecdf" strokeWidth="4" />
                <path d="M30 42a18 18 0 0 1 0 36a9 9 0 0 1 0-18a9 9 0 0 0 0-18z" fill="#f3ecdf" />
                <path d="M8 120H52M8 136H52" stroke="#f3ecdf" strokeWidth="3" opacity=".7" />
              </svg>
            </span>
          </div>
        ))}
        <svg className="ts-rail arena-near" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-20 40H1220" stroke="#120e12" strokeWidth="16" />
          <path d="M-20 34H1220" stroke="#3a2a2a" strokeWidth="3" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i}>
              <rect x={i * 150 - 8} y="34" width="16" height="90" fill="#120e12" />
              <ellipse cx={i * 150} cy="30" rx="14" ry="10" fill="#b8902f" />
              <path d={`M${i * 150 - 6} 22c4-10 8-10 12 0`} fill="#f2d88a" />
            </g>
          ))}
          <path d="M-20 92H1220" stroke="#120e12" strokeWidth="10" />
        </svg>
      </div>

      <div ref={flash} className="ts-flash" aria-hidden="true" />
      <Grain />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
      <div ref={fx} className="arena-fx" aria-hidden="true" />
    </div>
  );
}
