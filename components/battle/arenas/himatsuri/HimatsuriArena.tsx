"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { Grain, Haze, moteStyle, OrganicDefs, particles, play, pulse, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./himatsuri.css";

// La Fête du feu (火祭り), arène du palier Champion : une fête du feu la nuit, sur l'esplanade d'un
// sanctuaire. Tour à tambour (yagura) tendue de rouge et blanc, guirlandes de chōchin, brasiers en shu
// et pourpre (jamais d'orange), foule en ombres chinoises, dessinés pour Kiraku ; flammes, braises et
// feux d'artifice sont des calques animés. Sur téléphone, le tambourinaire et les premières lanternes
// tiennent au-dessus des cartes adverses, les deux kagaribi encadrent la ligne de front.

const FIREWORK_TONES = ["#f2d88a", "#fff6dc", "#e0533f", "#c9dcf3"] as const;

/** Bouquet de feu d'artifice : un éclat au cœur, puis deux couronnes d'étincelles à traînée, freinées et retombées (transform et opacity). */
function firework(layer: HTMLElement | null, x: number, y: number, size: number, tone: number, count = 22) {
  if (!layer || count <= 0) return;
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  const px = x * w;
  const py = y * h;
  const bloom = document.createElement("span");
  bloom.className = "hm-bloom";
  bloom.style.width = bloom.style.height = `${size * 1.4}px`;
  bloom.style.margin = `${-size * 0.7}px 0 0 ${-size * 0.7}px`;
  layer.appendChild(bloom);
  const glow = bloom.animate(
    [
      { transform: `translate(${px}px, ${py}px) scale(.2)`, opacity: 0.95 },
      { transform: `translate(${px}px, ${py}px) scale(1)`, opacity: 0 },
    ],
    { duration: 700, easing: "cubic-bezier(.1,.7,.3,1)", fill: "both" },
  );
  glow.finished.then(() => bloom.remove(), () => bloom.remove());
  [
    { n: count, r: size, tone },
    { n: Math.round(count / 2), r: size * 0.55, tone: tone + 1 },
  ].forEach((ring, k) => {
    for (let i = 0; i < ring.n; i++) {
      const s = document.createElement("span");
      s.className = "hm-spark";
      s.style.color = FIREWORK_TONES[(ring.tone + (i % 2) * 2) % FIREWORK_TONES.length];
      layer.appendChild(s);
      const a = ((i + k * 0.5) / ring.n) * Math.PI * 2;
      const r = ring.r * (0.85 + noise(i + tone + k * 50, 3) * 0.3);
      const deg = (a * 180) / Math.PI + 90;
      const anim = s.animate(
        [
          { transform: `translate(${px}px, ${py}px) rotate(${deg}deg) scale(.2)`, opacity: 1 },
          { transform: `translate(${px + Math.cos(a) * r * 0.85}px, ${py + Math.sin(a) * r * 0.85}px) rotate(${deg}deg) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${px + Math.cos(a) * r}px, ${py + Math.sin(a) * r + size * 0.45}px) rotate(${deg}deg) scale(.4)`, opacity: 0 },
        ],
        { duration: 1_300 + (i % 5) * 60 + k * 140, easing: "cubic-bezier(.12,.7,.3,1)", fill: "both" },
      );
      anim.finished.then(() => s.remove(), () => s.remove());
    }
  });
}

/** Guirlandes tendues du mât et des coins de la tour vers les bords de l'esplanade. */
const GARLANDS = [
  { x0: 600, y0: 30, x1: -80, y1: 132, sag: 22, n: 10 },
  { x0: 600, y0: 30, x1: 1280, y1: 132, sag: 22, n: 10 },
  { x0: 512, y0: 116, x1: -80, y1: 252, sag: 28, n: 7 },
  { x0: 688, y0: 116, x1: 1280, y1: 252, sag: 28, n: 7 },
] as const;
const cordOf = (g: (typeof GARLANDS)[number]) => `M${g.x0} ${g.y0}Q${(g.x0 + g.x1) / 2} ${(g.y0 + g.y1) / 2 + g.sag * 2} ${g.x1} ${g.y1}`;
const LANTERNS = GARLANDS.flatMap((g, gi) =>
  Array.from({ length: g.n }, (_, i) => {
    const t = 0.1 + i * 0.09;
    return { x: g.x0 + (g.x1 - g.x0) * t, y: g.y0 + (g.y1 - g.y0) * t + g.sag * 4 * t * (1 - t), red: (i + gi) % 3 !== 1, delay: -i * 0.6 - gi * 0.3 };
  }),
);
/** Brasiers : deux grands bûchers au loin, deux kagaribi sur trépied de part et d'autre de la ligne de front. */
const FIRES = [
  { x: 250, y: 270, w: 140, h: 170, kind: "pyre", embers: 6 },
  { x: 950, y: 270, w: 140, h: 170, kind: "pyre", embers: 6 },
  { x: 452, y: 352, w: 80, h: 150, kind: "kagari", embers: 7 },
  { x: 748, y: 352, w: 80, h: 150, kind: "kagari", embers: 7 },
] as const;
const CURTAIN = Array.from({ length: 14 }, (_, i) => 516 + i * 12);

export function HimatsuriArena({ level, handleRef, sound }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const crowd = useRef<HTMLDivElement>(null);
  const fires = useRef<HTMLDivElement>(null);
  const drummer = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const shots = useRef(0);

  const cheer = () => {
    pulse(crowd.current, [{ transform: "translateY(0px)" }, { transform: "translateY(-6%)", offset: 0.25 }, { transform: "translateY(-2%)", offset: 0.5 }, { transform: "translateY(-5%)", offset: 0.7 }, { transform: "translateY(0px)" }], { duration: 1_200 });
    pulse(crowd.current?.querySelector(".hm-arms"), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1_400 });
  };

  useArenaHandle(
    handleRef,
    [
      { ref: far, depth: 0.25 },
      { ref: edges, depth: 1.4 },
    ],
    (reaction) => {
      if (level === "reduced") return;
      switch (reaction) {
        case "turn":
          pulse(drummer.current, [{ transform: "translateY(0px)" }, { transform: "translateY(-3px)", offset: 0.2 }, { transform: "translateY(0px)", offset: 0.4 }, { transform: "translateY(-3px)", offset: 0.6 }, { transform: "translateY(0px)" }], { duration: 600 });
          play(sound, "drum");
          break;
        case "crit":
          cheer();
          // Le bouquet éclate d'un côté puis de l'autre du tambourinaire
          shots.current += 1;
          firework(sky.current, (shots.current % 2 ? 0.16 : 0.66) + noise(shots.current, 3) * 0.16, 0.1, 80, shots.current % 4, particles(level, 22));
          play(sound, "cheer");
          play(sound, "firework");
          break;
        case "ko":
          firework(sky.current, 0.5, 0.1, 120, 2, particles(level, 30));
          play(sound, "firework");
          break;
        case "technique":
          // Les brasiers ronflent : chaque flamme grandit depuis sa base
          fires.current?.querySelectorAll(".hm-fire").forEach((f, i) => pulse(f, [{ transform: "scale(1)" }, { transform: "scale(1.14)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 900, delay: i * 40, composite: "add" }));
          break;
        case "victory":
          cheer();
          [0.22, 0.52, 0.8].forEach((x, i) => setTimeout(() => firework(sky.current, x, 0.1 + i * 0.03, 100, i, particles(level, 14)), i * 380));
          play(sound, "cheer");
          play(sound, "firework");
          break;
        case "defeat":
          pulse(fires.current, [{ opacity: 1 }, { opacity: 0.45 }], { duration: 1_600, fill: "forwards" });
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.45 }], { duration: 1_600, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  return (
    <div className="arena arena-himatsuri" data-level={level}>
      <OrganicDefs id={u} />
      <div ref={far} className="arena-plane">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0c0408" />
              <stop offset=".2" stopColor="#200a12" />
              <stop offset=".34" stopColor="#44121a" />
              <stop offset=".44" stopColor="#6a1a1e" />
            </linearGradient>
            <linearGradient id={`${u}-ground`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#30100e" />
              <stop offset=".5" stopColor="#200b09" />
              <stop offset="1" stopColor="#0e0505" />
            </linearGradient>
            <radialGradient id={`${u}-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#e0533f" stopOpacity=".34" />
              <stop offset="1" stopColor="#c8372d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1200" height="900" fill={`url(#${u}-sky)`} />
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={noise(i, 3) * 1200} cy={noise(i, 5) * 200} r={0.7 + noise(i, 7) * 1.2} fill="#f3ecdf" opacity={0.2 + noise(i, 9) * 0.4} />
          ))}
          <ellipse cx="600" cy="300" rx="420" ry="190" fill={`url(#${u}-glow)`} />
          <g filter={`url(#${u}-rough)`}>
            {/* Fumées des grands bûchers */}
            <path d="M250 420C220 340 290 300 260 230C240 180 290 140 270 80" stroke="#2a1418" strokeWidth="60" fill="none" opacity=".5" strokeLinecap="round" />
            <path d="M950 420C980 340 910 300 940 230C960 180 910 140 930 80" stroke="#2a1418" strokeWidth="60" fill="none" opacity=".5" strokeLinecap="round" />
            {/* Toit du sanctuaire au fond, collines */}
            <path d="M0 330C160 300 300 312 420 300L600 300L780 300C900 312 1040 300 1200 330V420H0Z" fill="#140608" />
            <path d="M380 300L600 210L820 300Z" fill="#1a080a" />
            <path d="M340 304C420 292 520 288 600 286C680 288 780 292 860 304L840 312H360Z" fill="#240a0c" />
            {/* Tour à tambour (yagura) : pieds, croisillons, plate-forme, mât */}
            <path d="M566 150L548 404M634 150L652 404" stroke="#22100c" strokeWidth="9" />
            <path d="M538 190L676 300M662 190L524 300M524 300L690 404M676 300L510 404" stroke="#2e140e" strokeWidth="6" />
            <path d="M532 230H668M520 300H680" stroke="#3a1a14" strokeWidth="7" />
            <path d="M540 150L508 412M660 150L692 412" stroke="#3a1a14" strokeWidth="13" />
            <path d="M535 150L503 412M665 150L697 412" stroke="#8a3a24" strokeWidth="2.5" opacity=".6" />
            <path d="M600 118V22" stroke="#2a1210" strokeWidth="5" />
            <path d="M600 24l28 7-28 7z" fill="#c8372d" />
            <rect x="508" y="146" width="184" height="12" fill="#4a2018" />
            <path d="M508 146H692" stroke="#8a3a24" strokeWidth="2" opacity=".7" />
            {/* Rideau rouge et blanc (kōhaku) autour de la balustrade */}
            {CURTAIN.map((x, i) => (
              <path key={x} d={`M${x} 118H${x + 12}V${147 + noise(i, 61) * 2}H${x}Z`} fill={i % 2 ? "#f3ecdf" : "#c8372d"} />
            ))}
            <path d="M516 118H684V147H516Z" fill="#000" opacity=".12" />
            <path d="M512 116H688" stroke="#2a1210" strokeWidth="5" />
          </g>
          {/* Esplanade, papiers et pétales piétinés */}
          <path d="M0 410C200 400 400 404 600 402C800 400 1000 406 1200 410V900H0Z" fill={`url(#${u}-ground)`} />
          <g filter={`url(#${u}-fine)`}>
            {Array.from({ length: 30 }, (_, i) => (
              <rect key={i} x={noise(i, 11) * 1200} y={430 + noise(i, 13) ** 0.7 * 440} width={4 + noise(i, 17) * 5} height="3" fill={["#c8372d", "#f3ecdf", "#d9b556"][i % 3]} opacity=".5" transform={`rotate(${Math.round(noise(i, 19) * 180)} ${noise(i, 11) * 1200} ${430 + noise(i, 13) ** 0.7 * 440})`} />
            ))}
          </g>
        </svg>
      </div>

      {/* Flaques de lumière des brasiers, qui vacillent */}
      {FIRES.map((f, i) => (
        <i key={`pool-${i}`} className="arena-prop hm-pool" style={{ ["--px" as string]: f.x - f.w * 1.9, ["--py" as string]: f.y + f.h - f.h * 0.3, ["--pw" as string]: f.w * 3.8, ["--ph" as string]: f.h * 0.62, animationDelay: `${-i * 0.7}s` }} aria-hidden="true" />
      ))}

      {/* Feux d'artifice (réactions), puis guirlandes de lanternes */}
      <div ref={sky} className="arena-fx" aria-hidden="true" />
      <div className="hm-garland" aria-hidden="true">
        <svg className="arena-svg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
          {GARLANDS.map((g, gi) => (
            <path key={gi} d={cordOf(g)} stroke="#1a0a08" strokeWidth="2.5" fill="none" />
          ))}
        </svg>
        {LANTERNS.map((l, i) => (
          <span key={i} className="arena-prop hm-lantern" data-red={l.red || undefined} style={{ ["--px" as string]: l.x - 16, ["--py" as string]: l.y, ["--pw" as string]: 32, ["--ph" as string]: 46, animationDelay: `${l.delay}s` }} />
        ))}
      </div>

      {/* Le tambourinaire, debout derrière le rideau de la tour */}
      <div ref={drummer} className="arena-prop hm-drummer" style={{ ["--px" as string]: 556, ["--py" as string]: 60, ["--pw" as string]: 88, ["--ph" as string]: 60 }} aria-hidden="true">
        <svg viewBox="0 0 88 60">
          <ellipse cx="44" cy="44" rx="26" ry="15" fill="#5a2a1a" />
          <ellipse cx="44" cy="40" rx="22" ry="11" fill="#e2c79a" />
          <circle cx="44" cy="12" r="7" fill="#120608" />
          <path d="M34 22C38 18 50 18 54 22L56 36H32Z" fill="#120608" />
          <path d="M44 4h10" stroke="#f3ecdf" strokeWidth="3" />
        </svg>
        <span className="hm-arm hm-arm-l" />
        <span className="hm-arm hm-arm-r" />
      </div>

      {/* Brasiers : flammes en couches et braises qui montent */}
      <div ref={fires} className="hm-fires" aria-hidden="true">
        {FIRES.map((f, fi) => (
          <div key={fi} className="arena-prop hm-fire" data-kind={f.kind} style={{ ["--px" as string]: f.x - f.w / 2, ["--py" as string]: f.y, ["--pw" as string]: f.w, ["--ph" as string]: f.h }}>
            {f.kind === "pyre" ? (
              <svg viewBox="0 0 140 170" className="hm-pyre">
                <path d="M40 170L56 110H84L100 170Z" fill="#2a120c" />
                <path d="M46 150H94M50 130H90" stroke="#4a2414" strokeWidth="6" />
              </svg>
            ) : (
              <svg viewBox="0 0 80 150" className="hm-pyre">
                <path d="M40 100L13 150M40 100L67 150M40 100V150" stroke="#1a0c0a" strokeWidth="4" strokeLinecap="round" />
                <path d="M14 84Q40 112 66 84Z" fill="#2a120c" />
                <path d="M17 87Q40 104 63 87M23 94Q40 105 57 94" stroke="#4a2414" strokeWidth="2.5" fill="none" />
                <path d="M16 84H64" stroke="#e0533f" strokeWidth="2" opacity=".8" />
                <path d="M26 86L34 74M40 86L42 70M54 86L48 74" stroke="#1a0a08" strokeWidth="4" strokeLinecap="round" />
              </svg>
            )}
            <i />
            <i />
            <i />
            <i />
            {Array.from({ length: particles(level, f.embers) }, (_, i) => (
              <span key={i} className="hm-ember" style={moteStyle(i, 33 + fi * 7, { x: [26, 74], y: [6, 36] }, [2.6, 4.6], [2, 4])} />
            ))}
          </div>
        ))}
      </div>
      <Haze tone="rgb(200 60 50 / .14)" top="30%" height="24%" opacity={0.9} slow={0.7} />

      {/* Abords : la foule en ombres chinoises, en contre-jour des brasiers */}
      <div ref={edges} className="arena-edges">
        <div ref={crowd} className="hm-crowd arena-near">
          <svg viewBox="0 0 1200 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <g fill="#6a2016" transform="translate(0 -2.5)">
              {Array.from({ length: 34 }, (_, i) => {
                const x = i * 36 + (noise(i, 41) - 0.5) * 16;
                const h = 52 + noise(i, 43) * 30;
                return <circle key={i} cx={x} cy={160 - h} r={13 + noise(i, 47) * 4} />;
              })}
            </g>
            <g fill="#0a0305">
              {Array.from({ length: 34 }, (_, i) => {
                const x = i * 36 + (noise(i, 41) - 0.5) * 16;
                const h = 52 + noise(i, 43) * 30;
                return (
                  <g key={i}>
                    <circle cx={x} cy={160 - h} r={13 + noise(i, 47) * 4} />
                    <path d={`M${x - 26} 160C${x - 24} ${160 - h + 30} ${x - 14} ${160 - h + 14} ${x} ${160 - h + 12}C${x + 14} ${160 - h + 14} ${x + 24} ${160 - h + 30} ${x + 26} 160Z`} />
                  </g>
                );
              })}
            </g>
            <g className="hm-arms" fill="#0a0305">
              {Array.from({ length: 12 }, (_, i) => {
                const x = 30 + i * 100 + (noise(i, 53) - 0.5) * 30;
                return <path key={i} d={`M${x} 120L${x - 14} 60L${x - 8} 58L${x + 4} 112M${x + 30} 120L${x + 46} 62L${x + 52} 66L${x + 36} 116`} stroke="#0a0305" strokeWidth="9" strokeLinecap="round" />;
              })}
            </g>
          </svg>
        </div>
      </div>

      <Grain />
      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
