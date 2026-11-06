"use client";

import { useId, useRef } from "react";
import { noise } from "../../fx/vfx";
import { ArenaBackdrop, canvasPoint, moteStyle, particles, play, pulse, useArenaHandle, type ArenaProps } from "../shared";
import "../arena.css";
import "./himatsuri.css";

// La Fête du feu (火祭り), arène du palier Champion : une fête du feu la nuit, sur l'esplanade d'un
// sanctuaire. Le décor est une vidéo en boucle (feu, fumée, braises et lanternes y vivent déjà), posée
// sur son image fixe ; le code n'ajoute que la lumière des réactions (coup de tambour, halos des
// lanternes, embrasement des brasiers, feux d'artifice) et la foule en ombres chinoises au premier plan.
// Brasiers en shu et pourpre, jamais d'orange. Positions en unités de la toile 1200 × 900, relevées sur
// l'image : sur téléphone, le tambour tient au-dessus des cartes adverses et les deux kagaribi encadrent
// la ligne de front ; les bûchers ne se voient que sur grand écran.

const STILL = "/arenas/himatsuri/still-v1.webp";
const VIDEO = "/arenas/himatsuri/loop-v1.mp4";

/** Le tambour au sommet de la tour (yagura), le tambourinaire derrière. */
const DRUM = { x: 601, y: 130 };
/** Brasiers : centre de la lueur, rayon du halo et hauteur d'où partent les braises. */
const FIRES = [
  { x: 117, y: 335, r: 150, top: 300 },
  { x: 1083, y: 335, r: 150, top: 300 },
  { x: 415, y: 400, r: 95, top: 375 },
  { x: 785, y: 400, r: 95, top: 375 },
] as const;
/** Lanternes des guirlandes, de gauche à droite : x, y, et 1 pour une lanterne blanche. */
const LANTERNS: readonly (readonly [number, number, 0 | 1])[] = [
  [31, 156, 0], [91, 158, 0], [150, 157, 1], [186, 271, 0], [207, 154, 0], [237, 263, 1], [264, 148, 0], [285, 251, 0],
  [322, 141, 1], [333, 238, 0], [376, 131, 0], [379, 224, 1], [426, 204, 0], [432, 117, 0], [473, 182, 0], [490, 99, 1],
  [543, 80, 0], [660, 81, 1], [713, 101, 0], [729, 186, 0], [768, 120, 0], [779, 210, 1], [825, 134, 1], [825, 228, 0],
  [872, 244, 0], [881, 144, 0], [919, 257, 1], [937, 152, 0], [967, 266, 0], [995, 156, 1], [1013, 273, 0], [1053, 159, 0],
  [1111, 159, 0], [1169, 156, 0],
];

const FIREWORK_TONES = ["#f2d88a", "#fff6dc", "#e0533f", "#c9dcf3"] as const;
/** Lueur que chaque bouquet jette sur la scène (kin, washi, shu, ai). */
const FLASH_TONES = ["rgb(242 216 138 / .5)", "rgb(255 246 220 / .48)", "rgb(224 83 63 / .58)", "rgb(201 220 243 / .44)"] as const;

/**
 * Bouquet de feu d'artifice : un éclat au cœur, puis deux couronnes d'étincelles à traînée, freinées et
 * retombées (transform et opacity). Sa taille suit l'échelle de la toile, bornée pour rester lisible.
 */
function firework(layer: HTMLElement | null, x: number, y: number, base: number, tone: number, count = 22) {
  if (!layer || count <= 0) return;
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  const size = base * Math.min(1.4, Math.max(0.85, canvasPoint(layer, 0, 0).s));
  const px = x * w;
  const py = y * h;
  const bloom = document.createElement("span");
  bloom.className = "hm-bloom";
  bloom.style.width = bloom.style.height = `${size * 1.5}px`;
  bloom.style.margin = `${-size * 0.75}px 0 0 ${-size * 0.75}px`;
  layer.appendChild(bloom);
  const glow = bloom.animate(
    [
      { transform: `translate(${px}px, ${py}px) scale(.2)`, opacity: 0.9 },
      { transform: `translate(${px}px, ${py}px) scale(1)`, opacity: 0 },
    ],
    { duration: 600, easing: "cubic-bezier(.1,.7,.3,1)", fill: "both" },
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
      // L'étincelle naît éteinte au cœur et s'allume en s'écartant : pas d'étoile de traits au départ
      const anim = s.animate(
        [
          { transform: `translate(${px}px, ${py}px) rotate(${deg}deg) scale(.3)`, opacity: 0 },
          { transform: `translate(${px + Math.cos(a) * r * 0.3}px, ${py + Math.sin(a) * r * 0.3}px) rotate(${deg}deg) scale(1)`, opacity: 1, offset: 0.12 },
          { transform: `translate(${px + Math.cos(a) * r * 0.85}px, ${py + Math.sin(a) * r * 0.85}px) rotate(${deg}deg) scale(.9)`, opacity: 0.95, offset: 0.5 },
          { transform: `translate(${px + Math.cos(a) * r}px, ${py + Math.sin(a) * r + size * 0.5}px) rotate(${deg + 8}deg) scale(.35)`, opacity: 0 },
        ],
        { duration: 1_400 + (i % 5) * 70 + k * 140, easing: "cubic-bezier(.12,.7,.3,1)", fill: "both" },
      );
      anim.finished.then(() => s.remove(), () => s.remove());
    }
  });
}

/** Lueur d'un bouquet sur toute la scène, venue du ciel du côté où il éclate. */
function flash(el: HTMLElement | null, x: number, tone: string, strength: number) {
  if (!el) return;
  el.style.setProperty("--fx", `${Math.round(x * 100)}%`);
  el.style.setProperty("--flash", tone);
  pulse(el, [{ opacity: 0 }, { opacity: strength, offset: 0.12 }, { opacity: 0 }], { duration: 950 });
}

/** Gerbe de braises qui jaillit d'un brasier : de petites lueurs qui montent en s'écartant, puis s'éteignent. */
function cinders(layer: HTMLElement | null, px: number, py: number, count: number, spread: number) {
  if (!layer || count <= 0) return;
  const { x, y, s } = canvasPoint(layer, px, py);
  for (let i = 0; i < count; i++) {
    const e = document.createElement("span");
    e.className = "hm-cinder";
    layer.appendChild(e);
    const dx = (noise(i + px, 61) - 0.5) * spread * 1.4 * s;
    const up = (150 + noise(i + px, 67) * 210) * s;
    const a = e.animate(
      [
        { transform: `translate(${x + dx * 0.1}px, ${y}px) scale(1.2)`, opacity: 0 },
        { transform: `translate(${x + dx * 0.45}px, ${y - up * 0.35}px) scale(1)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${x + dx}px, ${y - up}px) scale(.35)`, opacity: 0 },
      ],
      { duration: 1_100 + noise(i + px, 71) * 900, delay: noise(i + px, 73) * 300, easing: "cubic-bezier(.2,.6,.4,1)", fill: "both" },
    );
    a.finished.then(() => e.remove(), () => e.remove());
  }
}

/**
 * La foule est dessinée sur une bande de 3000 × 160, bien plus large que haute : cadrée en
 * `xMidYMax slice`, elle se règle toujours sur sa hauteur et n'est rognée que sur les côtés, si bien que
 * le haut des têtes et le dégradé de contre-jour restent entiers, du téléphone à l'écran ultra-large.
 */
const CROWD_W = 3000;

/**
 * Un rang de spectateurs (têtes et épaules), tiré d'une suite fixe : places irrégulières, tailles, épaules
 * de biais, quelques chignons. `height` : hauteur du haut des têtes au-dessus du bord bas.
 */
function crowdRow(n: number, salt: number, size: readonly [number, number], height: readonly [number, number]) {
  return Array.from({ length: n }, (_, i) => {
    const x = ((i + 0.5) / n) * CROWD_W + (noise(i, salt) - 0.5) * (CROWD_W / n) * 0.9;
    const r = size[0] + noise(i, salt + 1) * (size[1] - size[0]);
    const top = 160 - (height[0] + noise(i, salt + 2) * (height[1] - height[0]));
    return { x, r, hy: top + r, w: r * (2 + noise(i, salt + 3) * 0.7), tilt: (noise(i, salt + 4) - 0.5) * 0.5, bun: noise(i, salt + 5) > 0.8 };
  });
}
type Person = ReturnType<typeof crowdRow>[number];
/** Le rang du fond, plus petit, éclairé par les brasiers ; le rang de devant, plus grand, dans l'ombre. */
const BACK_ROW = crowdRow(115, 81, [8, 11], [78, 104]);
const FRONT_ROW = crowdRow(75, 91, [13, 18], [44, 72]);
/** Ceux du rang de devant qui lèvent les bras quand la foule acclame. */
const CHEERERS = FRONT_ROW.filter((_, i) => i % 3 === 1);

/** Les corps descendent sous le bord de la bande : le flou ne l'éclaircit pas, la foule continue en dessous. */
const bodyOf = (p: Person) => {
  const left = p.hy + p.r * (1.5 + p.tilt);
  const right = p.hy + p.r * (1.5 - p.tilt);
  return `M${p.x - p.w} 200C${p.x - p.w} ${left + p.r} ${p.x - p.w * 0.62} ${left} ${p.x} ${p.hy + p.r * 1.25}C${p.x + p.w * 0.62} ${right} ${p.x + p.w} ${right + p.r} ${p.x + p.w} 200Z`;
};
const armsOf = (p: Person) =>
  `M${p.x - p.w * 0.5} ${p.hy + p.r * 1.8}L${p.x - p.w * 0.78} ${p.hy - p.r * 1.7}M${p.x + p.w * 0.5} ${p.hy + p.r * 1.8}L${p.x + p.w * 0.82} ${p.hy - p.r * 1.55}`;

function People({ row }: { row: readonly Person[] }) {
  return row.map((p, i) => (
    <g key={i}>
      <circle cx={p.x} cy={p.hy} r={p.r} />
      {p.bun && <circle cx={p.x + p.r * 0.2} cy={p.hy - p.r * 1.05} r={p.r * 0.45} />}
      <path d={bodyOf(p)} />
    </g>
  ));
}

/**
 * La foule en ombres chinoises, en contre-jour des brasiers, floue comme un premier plan de cinéma : une
 * lueur pourpre derrière les têtes, qui part de rien en haut de la bande, pour qu'elles se détachent du
 * sol sombre, et un liseré cramoisi discret. Chaque rang est dessiné une fois et repris par <use> pour son
 * liseré. Le flou est un filtre SVG calculé une fois ; les bras levés sont un calque à part, dont seule
 * l'opacité s'anime : la foule n'est jamais repeinte pendant une acclamation.
 */
function Crowd({ id }: { id: string }) {
  const view = `0 0 ${CROWD_W} 160`;
  return (
    <>
      <svg viewBox={view} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-rim`} gradientUnits="userSpaceOnUse" cx={CROWD_W / 2} cy="40" r="1900">
            <stop offset="0" stopColor="#ff8a70" />
            <stop offset=".4" stopColor="#d4453a" />
            <stop offset="1" stopColor="#7a1e18" />
          </radialGradient>
          <linearGradient id={`${id}-back`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8c241c" stopOpacity="0" />
            <stop offset=".55" stopColor="#8c241c" stopOpacity=".3" />
            <stop offset="1" stopColor="#3a0e0c" stopOpacity=".28" />
          </linearGradient>
          <filter id={`${id}-far`} x="-1%" y="-30%" width="102%" height="160%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <filter id={`${id}-near`} x="-1%" y="-30%" width="102%" height="160%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <g id={`${id}-backrow`}>
            <People row={BACK_ROW} />
          </g>
          <g id={`${id}-frontrow`}>
            <People row={FRONT_ROW} />
          </g>
        </defs>
        <rect y="20" width={CROWD_W} height="140" fill={`url(#${id}-back)`} />
        <g filter={`url(#${id}-far)`}>
          <use href={`#${id}-backrow`} fill={`url(#${id}-rim)`} transform="translate(0 -2.2)" opacity=".6" />
          <use href={`#${id}-backrow`} fill="#1a0807" />
        </g>
        <g filter={`url(#${id}-near)`}>
          <use href={`#${id}-frontrow`} fill={`url(#${id}-rim)`} transform="translate(0 -2.4)" opacity=".32" />
          <use href={`#${id}-frontrow`} fill="#070304" />
        </g>
      </svg>
      <svg className="hm-arms" viewBox={view} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <g filter={`url(#${id}-near)`} fill="none" stroke="#070304" strokeLinecap="round">
          {CHEERERS.map((p, i) => (
            <path key={i} d={armsOf(p)} strokeWidth={p.r * 0.55} />
          ))}
        </g>
      </svg>
    </>
  );
}

export function HimatsuriArena({ level, handleRef, sound }: ArenaProps) {
  const u = useId().replace(/:/g, "");
  const far = useRef<HTMLDivElement>(null);
  const edges = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const halos = useRef<HTMLDivElement>(null);
  const fires = useRef<HTMLDivElement>(null);
  const beat = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const crowd = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const shots = useRef(0);

  const cheer = () => {
    pulse(crowd.current, [{ transform: "translateY(0px)" }, { transform: "translateY(-6%)", offset: 0.25 }, { transform: "translateY(-2%)", offset: 0.5 }, { transform: "translateY(-5%)", offset: 0.7 }, { transform: "translateY(0px)" }], { duration: 1_200 });
    pulse(crowd.current?.querySelector(".hm-arms"), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 1_400 });
  };

  /** Le tambour résonne : éclat et onde au sommet de la tour, toutes les lanternes pulsent ensemble. */
  const drum = () => {
    const [flare, ring] = beat.current?.children ?? [];
    pulse(flare, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)", offset: 0.15 }, { opacity: 0, transform: "scale(1.15)" }], { duration: 650 });
    pulse(ring, [{ opacity: 0.9, transform: "scale(.3)" }, { opacity: 0, transform: "scale(1.9)" }], { duration: 750, easing: "cubic-bezier(.1,.6,.3,1)" });
    pulse(halos.current, [{ opacity: 0 }, { opacity: 0.55, offset: 0.18 }, { opacity: 0 }], { duration: 700 });
  };

  /** Vague de lumière dans les guirlandes, du centre vers les bords (effets complets seulement). */
  const wave = () => {
    const box = halos.current;
    if (!box || level !== "full") return;
    const lit = [...box.children].map((h, i) =>
      h.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 700, delay: Math.abs(LANTERNS[i][0] - 600) * 0.9, easing: "ease-out", fill: "both" }),
    );
    const reset = () => lit.forEach((a) => a.cancel());
    box.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1_300 }).finished.then(reset, reset);
  };

  /** Les brasiers s'embrasent : le halo de chacun gonfle, tient un instant, et une gerbe de braises en jaillit. */
  const surge = () => {
    fires.current?.querySelectorAll(".hm-surge").forEach((f, i) =>
      pulse(
        f,
        [
          { opacity: 0, transform: "scale(.75)" },
          { opacity: 1, transform: "scale(1.25)", offset: 0.22 },
          { opacity: 0.6, transform: "scale(1.15)", offset: 0.55 },
          { opacity: 0, transform: "scale(1.05)" },
        ],
        { duration: 1_500, delay: i * 50, easing: "ease-out" },
      ),
    );
    FIRES.forEach((f) => cinders(sparks.current, f.x, f.top, particles(level, f.r > 100 ? 16 : 10), f.r));
  };

  /** Un bouquet et la lueur qu'il jette sur la scène. */
  const burst = (x: number, y: number, size: number, tone: number, count: number, strength: number) => {
    firework(sky.current, x, y, size, tone, count);
    flash(glow.current, x, FLASH_TONES[tone % FLASH_TONES.length], strength);
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
          drum();
          play(sound, "drum");
          break;
        case "crit": {
          cheer();
          // Le bouquet éclate d'un côté puis de l'autre de la tour
          shots.current += 1;
          const n = shots.current;
          burst((n % 2 ? 0.16 : 0.66) + noise(n, 3) * 0.16, 0.12, 80, n % 4, particles(level, 24), 0.6);
          play(sound, "cheer");
          play(sound, "firework");
          break;
        }
        case "ko":
          burst(0.5, 0.11, 120, 2, particles(level, 32), 0.85);
          wave();
          play(sound, "firework");
          break;
        case "technique":
          surge();
          break;
        case "victory":
          cheer();
          wave();
          [0.22, 0.52, 0.8].forEach((x, i) => setTimeout(() => burst(x, 0.1 + i * 0.03, 100, i, particles(level, 18), 0.55), i * 380));
          play(sound, "cheer");
          play(sound, "firework");
          break;
        case "defeat":
          // La fête retombe : le feu ralentit, la nuit gagne
          if (video.current) video.current.playbackRate = 0.5;
          pulse(dim.current, [{ opacity: 0 }, { opacity: 0.45 }], { duration: 1_600, fill: "forwards" });
          break;
        default:
          break;
      }
    },
  );

  const motes = particles(level, 12);

  return (
    <div className="arena arena-himatsuri" data-level={level}>
      {/* Le décor en vidéo, et la lumière posée dessus : halos, embrasements, tambour, ciel */}
      <div ref={far} className="arena-plane">
        <ArenaBackdrop still={STILL} video={VIDEO} level={level} videoRef={video} />
        <div ref={halos} className="hm-halos" aria-hidden="true">
          {LANTERNS.map(([x, y, white]) => (
            <i key={`${x}-${y}`} className="arena-prop hm-halo" data-white={white || undefined} style={{ ["--px" as string]: x - 48, ["--py" as string]: y - 48, ["--pw" as string]: 96, ["--ph" as string]: 96 }} />
          ))}
        </div>
        <div ref={fires} aria-hidden="true">
          {FIRES.map((f) => (
            <i key={f.x} className="arena-prop hm-surge" style={{ ["--px" as string]: f.x - f.r, ["--py" as string]: f.y - f.r, ["--pw" as string]: f.r * 2, ["--ph" as string]: f.r * 2 }} />
          ))}
        </div>
        <div ref={beat} className="arena-prop hm-beat" style={{ ["--px" as string]: DRUM.x - 80, ["--py" as string]: DRUM.y - 80, ["--pw" as string]: 160, ["--ph" as string]: 160 }} aria-hidden="true">
          <i className="hm-flare" />
          <i className="hm-ring" />
        </div>
        <div ref={sky} className="arena-fx" aria-hidden="true" />
        <div ref={sparks} className="arena-fx" aria-hidden="true" />
      </div>
      <div ref={glow} className="hm-glow" aria-hidden="true" />
      <div className="hm-vignette" aria-hidden="true" />

      {/* Abords : braises en suspension et foule en ombres chinoises, au premier plan */}
      <div ref={edges} className="arena-edges">
        {motes > 0 && (
          <div className="hm-motes" aria-hidden="true">
            {Array.from({ length: motes }, (_, i) => (
              <span key={i} className="hm-mote" style={moteStyle(i, 71, { x: [3, 97], y: [62, 100] }, [8, 14], [5, 12])} />
            ))}
          </div>
        )}
        <div ref={crowd} className="hm-crowd">
          <Crowd id={u} />
        </div>
      </div>

      <div ref={dim} className="arena-dim" aria-hidden="true" />
    </div>
  );
}
