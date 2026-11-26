import { seededFloat } from "@/lib/rng";
import type { SoundName } from "@/lib/sound/synth";
import type { CoinSide } from "./fairness";
import type { FlipChoreography } from "./tiers";

// Chorégraphie du lancer, sans DOM : chaque élément de la scène reçoit une liste de points (instant, transform,
// opacité, courbe vers le point suivant), traduite en Web Animations par components/casino/CoinFlipStage.tsx.
// L'issue est connue avant le premier point : la pièce retombe toujours sur la face tirée par le serveur, et on
// ne simule jamais un « presque gagné ». Plateau de 375 × 760 (bandeau adverse en haut, le sien en bas).

export type FlipFx = {
  /** Temps suspendu au sommet (ms). */
  hang: number;
  /** Demi-tours visibles pendant la suspension. */
  half: number;
  /** Étincelles au coup de sceau. */
  dust: number;
  /** Assombrissement de la salle (0 à 1). */
  dim: number;
  taiko: boolean;
  /** Feuilles d'or pour le gagnant. */
  flakes: boolean;
  /** Éclat doré plein. */
  rays: boolean;
};

// Du palier 0 (Commune) au palier 6 (au-dessus de Mythique) : plus le pot est rare, plus le suspense dure
const FX: readonly FlipFx[] = [
  { hang: 460, half: 2, dust: 6, dim: 0.3, taiko: false, flakes: false, rays: false },
  { hang: 520, half: 2, dust: 7, dim: 0.34, taiko: false, flakes: false, rays: false },
  { hang: 600, half: 2, dust: 8, dim: 0.38, taiko: false, flakes: false, rays: false },
  { hang: 820, half: 3, dust: 12, dim: 0.46, taiko: false, flakes: false, rays: false },
  { hang: 1060, half: 3, dust: 18, dim: 0.55, taiko: true, flakes: true, rays: true },
  { hang: 1320, half: 4, dust: 24, dim: 0.62, taiko: true, flakes: true, rays: true },
  { hang: 1500, half: 4, dust: 30, dim: 0.66, taiko: true, flakes: true, rays: true },
];

export function flipFx(level: number): FlipFx {
  return FX[Math.max(0, Math.min(FX.length - 1, Math.round(level)))];
}

/** Courbe de ressort amorti échantillonnée en `linear()` CSS (ζ < 1 : dépassement puis retour). */
export function springCurve(zeta: number, samples = 48): string {
  const dt = 0.002;
  let x = 0;
  let v = 0;
  let t = 0;
  const raw: [number, number][] = [[0, 0]];
  while (t < 40) {
    const a = -(x - 1) - 2 * zeta * v;
    v += a * dt;
    x += v * dt;
    t += dt;
    raw.push([t, x]);
    if (Math.abs(x - 1) < 0.004 && Math.abs(v) < 0.004) break;
  }
  const values: number[] = [];
  let j = 0;
  for (let i = 0; i <= samples; i++) {
    const at = (i / samples) * t;
    while (j < raw.length - 1 && raw[j + 1][0] <= at) j++;
    values.push(i === samples ? 1 : raw[j][1]);
  }
  return `linear(${values.map((n) => Number(n.toFixed(4))).join(", ")})`;
}

export type Curves = { settle: string; snap: string; pop: string; tablet: string };

/** Ressorts en `linear()` si le navigateur le comprend, sinon leurs approximations en Bézier. */
export function flipCurves(linearSupported: boolean): Curves {
  return linearSupported
    ? { settle: springCurve(0.86), snap: springCurve(0.42), pop: springCurve(0.7), tablet: springCurve(0.8) }
    : {
        settle: "cubic-bezier(0.22, 1, 0.36, 1)",
        snap: "cubic-bezier(0.3, 1.6, 0.5, 1)",
        pop: "cubic-bezier(0.25, 1.1, 0.4, 1)",
        tablet: "cubic-bezier(0.2, 0.9, 0.25, 1.05)",
      };
}

const E = { out: "cubic-bezier(0.22, 1, 0.36, 1)", inOut: "cubic-bezier(0.65, 0, 0.35, 1)", in: "cubic-bezier(0.5, 0, 0.75, 0)" };

/** Éléments animés de la scène (T = bandeau du haut, M = bandeau du bas, celui du joueur). */
export const TRACKS = [
  "bannerT",
  "bannerM",
  "glowT",
  "glowM",
  "sealT",
  "sealM",
  "haloT",
  "haloM",
  "taisen",
  "cardT",
  "cardM",
  "coin",
  "tilt",
  "flash",
  "spot",
  "dim",
  "hanko",
  "ring",
  "rays",
  "outro",
  "ov",
  "swash",
  "okk",
  "olabel",
  "tablet",
] as const;
export type Track = (typeof TRACKS)[number];

export type Point = { t: number; tf?: string; op?: number; e?: string };
export type Base = { tf: string; op: number };

const posTf = (x: number, y: number, z: number) => `translate3d(${x}px, ${y}px, ${z}px)`;
const rotTf = (p: number, a: number, b = 0) => `rotateZ(${p}deg) rotateX(${a}deg) rotateY(${b}deg)`;
const cardTf = (x: number, y: number, z: number, rz: number) => `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${rz}deg)`;
const flat = (x: number, y: number, s: number, rz = 0) => `translate(${x}px, ${y}px) scale(${s}) rotate(${rz}deg)`;
const HAND = posTf(92, 178, 14);

/** État de repos de chaque élément (avant son premier point). */
export const BASE: Record<Track, Base> = {
  bannerT: { tf: "translate(0px, 0px) rotate(0deg)", op: 1 },
  bannerM: { tf: "translate(0px, 0px) rotate(0deg)", op: 1 },
  glowT: { tf: "none", op: 0 },
  glowM: { tf: "none", op: 0 },
  sealT: { tf: "scale(1)", op: 1 },
  sealM: { tf: "scale(1)", op: 1 },
  haloT: { tf: "none", op: 0 },
  haloM: { tf: "none", op: 0 },
  taisen: { tf: "scale(1) rotate(-11deg)", op: 0 },
  cardT: { tf: cardTf(0, -104, 2, 0), op: 1 },
  cardM: { tf: cardTf(0, 104, 2, 0), op: 1 },
  coin: { tf: HAND, op: 1 },
  tilt: { tf: rotTf(0, 0, 0), op: 1 },
  flash: { tf: "translateZ(3px) scale(0.6)", op: 0 },
  spot: { tf: "translateZ(1px) scale(1)", op: 0.45 },
  dim: { tf: "none", op: 0 },
  hanko: { tf: flat(0, 0, 1, -11), op: 0 },
  ring: { tf: "scale(1)", op: 0 },
  rays: { tf: "rotate(0deg) scale(1)", op: 0 },
  outro: { tf: "none", op: 0 },
  ov: { tf: "translateY(0px) scale(1)", op: 1 },
  swash: { tf: "scaleX(1)", op: 0 },
  okk: { tf: "scale(1)", op: 0 },
  olabel: { tf: "translateY(0px) scale(1)", op: 0 },
  tablet: { tf: "translateY(0%)", op: 0 },
};

/** Éléments en 3D : leur opacité ne s'anime jamais (elle aplatirait la scène dans certains navigateurs). */
export const NO_OPACITY: ReadonlySet<Track> = new Set(["coin", "tilt"]);

export type FlipScript = {
  points: Map<Track, Point[]>;
  /** Opacité des faces et de la tranche de la pièce (apparition dans la main). */
  coinOpacity: Point[];
  sounds: { t: number; name: SoundName; volume: number }[];
  /** Coup de sceau : étincelles (et feuilles d'or pour un gagnant de gros pot). */
  verdictAt: number;
  /** La tablette du résultat est en place : fin du déroulé. */
  settleAt: number;
  /** Instant de la toute fin de la retombée, quand la face est lisible. */
  landedAt: number;
};

export type ScriptInput = {
  /** Face tirée par le serveur. */
  result: CoinSide;
  /** Face du bandeau du haut (l'autre joueur) ; celle du bas est l'autre. */
  topSide: CoinSide;
  /** Le joueur du bas (celui qui regarde) gagne. */
  bottomWins: boolean;
  choreography: FlipChoreography;
  fx: FlipFx;
  curves: Curves;
  /** Graine des variations (nombre de demi-tours à la retombée) : l'id de la table. */
  seed: number;
};

export function flipScript(input: ScriptInput): FlipScript {
  const { result, fx: T, curves: C } = input;
  const win = input.bottomWins;
  const points = new Map<Track, Point[]>();
  const coinOpacity: Point[] = [];
  const sounds: FlipScript["sounds"] = [];
  const pt = (track: Track, t: number, p: Omit<Point, "t">) => {
    const list = points.get(track) ?? [];
    list.push({ t, ...p });
    points.set(track, list);
  };
  const sfx = (t: number, name: SoundName, volume: number) => sounds.push({ t, name, volume });
  // Bandeau de chaque face : celui du haut joue topSide
  const bannerOf = (side: CoinSide) => (side === input.topSide ? "T" : "M");

  // Face-à-face : les deux bandeaux entrent, 対 frappe, les fuda se posent
  pt("bannerT", 0, { tf: "translate(120%, -6px) rotate(-6deg)", op: 0, e: C.settle });
  pt("bannerT", 520, { tf: "translate(0px, 0px) rotate(0deg)", op: 1 });
  pt("bannerM", 60, { tf: "translate(-120%, 6px) rotate(-6deg)", op: 0, e: C.settle });
  pt("bannerM", 580, { tf: "translate(0px, 0px) rotate(0deg)", op: 1 });
  pt("taisen", 200, { tf: "scale(2.6) rotate(-24deg)", op: 0, e: "cubic-bezier(0.55, 0, 0.85, 0.4)" });
  pt("taisen", 560, { tf: "scale(0.92) rotate(-10deg)", op: 1, e: "ease-out" });
  pt("taisen", 700, { tf: "scale(1) rotate(-11deg)", op: 1, e: E.in });
  pt("taisen", 960, { tf: "scale(0.86) rotate(-11deg)", op: 0 });
  pt("cardM", 260, { tf: cardTf(0, 250, 70, -8), op: 0, e: C.settle });
  pt("cardM", 760, { tf: cardTf(0, 104, 2, 0), op: 1 });
  pt("cardT", 180, { tf: cardTf(0, -104, 2, 0), op: 1, e: E.out });
  pt("cardT", 330, { tf: cardTf(0, -104, 16, 0), op: 1, e: E.in });
  pt("cardT", 480, { tf: cardTf(0, -104, 2, 0), op: 1 });
  sfx(300, "whoosh", 0.3);
  sfx(470, "clack", 0.5);
  sfx(560, "stamp", 0.5);

  // Chaque face qui passe vers le haut fait briller le sceau de son joueur
  const pulse = (side: CoinSide, t: number) => {
    const b = bannerOf(side);
    const seal = `seal${b}` as Track;
    const halo = `halo${b}` as Track;
    pt(seal, t - 70, { tf: "scale(1)", e: E.out });
    pt(seal, t + 60, { tf: "scale(1.22)", e: E.inOut });
    pt(seal, t + 300, { tf: "scale(1)" });
    pt(halo, t - 70, { op: 0, e: E.out });
    pt(halo, t + 60, { op: 1, e: E.inOut });
    pt(halo, t + 340, { op: 0 });
  };
  const coinIn = () => {
    pt("coin", 430, { tf: HAND, e: E.out });
    coinOpacity.push({ t: 430, op: 0, e: E.out }, { t: 560, op: 1 });
  };
  const suspense = (from: number, to: number) => {
    pt("dim", from, { op: 0, e: E.inOut });
    pt("dim", from + 320, { op: T.dim });
    pt("dim", to, { op: T.dim, e: E.inOut });
    pt("dim", to + 600, { op: T.dim * 0.35 });
    pt("spot", from, { tf: "translateZ(1px) scale(1)", op: 0.45, e: E.inOut });
    pt("spot", from + 320, { tf: "translateZ(1px) scale(0.86)", op: 1 });
    pt("spot", to, { tf: "translateZ(1px) scale(0.86)", op: 1, e: E.inOut });
    pt("spot", to + 500, { tf: "translateZ(1px) scale(1.1)", op: 0.7 });
  };

  // Lancer : coup de pouce, ralenti au sommet, retombée, rebonds et oscillation. La rotation finale F est un
  // multiple de 360° pour 表 (face vers le haut), décalé de 180° pour 裏.
  const toss = () => {
    // Générateur à graine (mulberry32) : un même lancer rejoue à l'identique
    const rand = seededFloat(input.seed);
    const t0 = 650;
    const rise = 400;
    const fall = 360;
    const apex = t0 + rise;
    const hangEnd = apex + T.hang;
    const L = hangEnd + fall;
    const fallHalf = rand() < 0.5 ? 4 : 5;
    const F = 360 * (6 + T.half) + (result === "URA" ? 180 : 0);
    const A2 = F - 180 * fallHalf;
    const A1 = A2 - 180 * T.half;
    const hangSpeed = (180 * T.half) / T.hang;
    const endSlope = Math.min(0.9, hangSpeed / (A1 / rise));
    const startSlope = Math.min(0.9, hangSpeed / ((180 * fallHalf) / fall));
    const riseEase = `cubic-bezier(0.25, 0.6, 0.55, ${(1 - endSlope * 0.45).toFixed(3)})`;
    const fallEase = `cubic-bezier(0.3, ${(startSlope * 0.3).toFixed(3)}, 0.8, 0.6)`;
    coinIn();
    pt("coin", t0, { tf: HAND, e: "cubic-bezier(0.2, 0.7, 0.35, 1)" });
    pt("coin", apex, { tf: posTf(0, 10, 226), e: "linear" });
    pt("coin", hangEnd, { tf: posTf(0, 0, 244), e: "cubic-bezier(0.55, 0, 0.9, 0.55)" });
    pt("coin", L, { tf: posTf(0, 0, 5), e: "cubic-bezier(0.2, 0.6, 0.4, 1)" });
    pt("coin", L + 90, { tf: posTf(0, 0, 21), e: "cubic-bezier(0.5, 0, 0.9, 0.5)" });
    pt("coin", L + 190, { tf: posTf(0, 0, 5), e: "ease-out" });
    pt("coin", L + 250, { tf: posTf(0, 0, 10), e: "ease-in" });
    pt("coin", L + 310, { tf: posTf(0, 0, 5) });
    pt("tilt", t0, { tf: rotTf(0, 0, 0), e: riseEase });
    pt("tilt", apex, { tf: rotTf(0, A1, 0), e: "linear" });
    pt("tilt", hangEnd, { tf: rotTf(0, A2, 0), e: fallEase });
    pt("tilt", L, { tf: rotTf(0, F, 0), e: "ease-out" });
    pt("tilt", L + 110, { tf: rotTf(0, F + 13, 5), e: "ease-in-out" });
    pt("tilt", L + 220, { tf: rotTf(0, F - 8, -4), e: "ease-in-out" });
    pt("tilt", L + 320, { tf: rotTf(0, F + 4, 2), e: "ease-in-out" });
    pt("tilt", L + 410, { tf: rotTf(0, F - 1.5, -1), e: "ease-in-out" });
    pt("tilt", L + 480, { tf: rotTf(0, F, 0) });
    for (let k = 0; k <= T.half; k++) {
      const up: CoinSide = (A1 / 180 + k) % 2 === 0 ? "OMOTE" : "URA";
      pulse(up, apex + (T.hang * k) / T.half);
      sfx(apex + (T.hang * k) / T.half, "flip", 0.35);
    }
    suspense(apex - 120, L + 200);
    sfx(t0 - 20, "whoosh", 0.55);
    for (let t = t0 + 40; t < apex; t += 55) sfx(t, "tick", 0.12);
    for (let t = hangEnd + 30; t < L; t += 45) sfx(t, "tick", 0.12);
    sfx(L, "coin", 0.75);
    sfx(L + 190, "coin", 0.45);
    sfx(L + 310, "coin", 0.25);
    return { landed: L + 480, verdict: L + 300 };
  };

  // Toupie : la pièce se dresse sur la tranche, tourne, vacille et tombe sur la face tirée (tau final)
  const spin = () => {
    const R0 = 34;
    const half = 5;
    const start = 600;
    const up = 860;
    const spinEnd = up + 700 + T.hang;
    const W = 760;
    const L = spinEnd + W;
    const tauF = result === "URA" ? -180 : 0;
    const PHI1 = 360 * (6 + Math.round(T.hang / 300));
    const total = 2520;
    coinIn();
    pt("coin", start, { tf: HAND, e: "cubic-bezier(0.3, 0.6, 0.3, 1)" });
    pt("coin", up, { tf: posTf(0, 0, R0 + half) });
    pt("tilt", start, { tf: rotTf(0, 0, 0), e: "cubic-bezier(0.3, 0.6, 0.3, 1)" });
    pt("tilt", up, { tf: rotTf(0, -90, 0), e: "cubic-bezier(0.15, 0.55, 0.5, 0.92)" });
    pt("tilt", spinEnd, { tf: rotTf(PHI1, -90, 0), e: "linear" });
    for (const u of [0.18, 0.34, 0.48, 0.6, 0.7, 0.79, 0.87, 0.93, 0.97, 1]) {
      const tau = -90 + (tauF + 90) * Math.pow(u, 1.6);
      const phi = PHI1 + total * (0.1 * u + 0.9 * u * u * u);
      const z = R0 * Math.abs(Math.sin((tau * Math.PI) / 180)) + half;
      pt("tilt", spinEnd + W * u, { tf: rotTf(phi, tau, 0), e: "linear" });
      pt("coin", spinEnd + W * u, { tf: posTf(0, 0, z), e: "linear" });
    }
    pt("coin", L + 70, { tf: posTf(0, 0, 9), e: "ease-in" });
    pt("coin", L + 140, { tf: posTf(0, 0, half) });
    pt("tilt", L + 80, { tf: rotTf(PHI1 + total, tauF + 5, 0), e: "ease-in-out" });
    pt("tilt", L + 160, { tf: rotTf(PHI1 + total, tauF - 2.5, 0), e: "ease-in-out" });
    pt("tilt", L + 240, { tf: rotTf(PHI1 + total, tauF, 0) });
    suspense(up, L + 200);
    sfx(up, "coin", 0.3);
    let gap = 42;
    for (let t = up + 40; t < spinEnd; t += gap) {
      sfx(t, "tick", 0.1);
      gap = Math.min(150, gap * 1.06);
    }
    gap = 130;
    for (let t = spinEnd; t < L; t += gap) {
      sfx(t, "tick", 0.16);
      gap = Math.max(16, gap * 0.84);
    }
    sfx(L, "coin", 0.7);
    sfx(L + 140, "coin", 0.3);
    return { landed: L + 240, verdict: L + 300 };
  };

  const { landed, verdict: V } = input.choreography === "spin" ? spin() : toss();

  // Sceau de la face gagnante, anneau, éclat ; le sceau file vers le bandeau du gagnant
  const winnerBanner = win ? "M" : "T";
  const dy = win ? 307 : -280;
  pt("hanko", V, { tf: flat(0, 0, 2.6, -24), op: 0, e: "cubic-bezier(0.55, 0, 0.85, 0.4)" });
  pt("hanko", V + 290, { tf: flat(0, 0, 0.92, -10), op: 1, e: C.snap });
  pt("hanko", V + 560, { tf: flat(0, 0, 1, -11), op: 1, e: "cubic-bezier(0.5, 0, 0.2, 1)" });
  pt("hanko", V + 800, { tf: flat(0, 0, 1, -11), e: "cubic-bezier(0.6, 0, 0.3, 1)" });
  pt("hanko", V + 1180, { tf: flat(140, dy, 0.36, 0), op: 1, e: E.in });
  pt("hanko", V + 1260, { tf: flat(140, dy, 0.3, 0), op: 0 });
  pt("ring", V + 250, { tf: "scale(0.4)", op: 0 });
  pt("ring", V + 260, { tf: "scale(0.4)", op: 0.9, e: E.out });
  pt("ring", V + 780, { tf: "scale(2.2)", op: 0 });
  pt("flash", V + 200, { tf: "translateZ(3px) scale(0.6)", op: 0, e: E.out });
  pt("flash", V + 300, { tf: "translateZ(3px) scale(1)", op: 0.8, e: E.out });
  pt("flash", V + 760, { tf: "translateZ(3px) scale(1.4)", op: 0 });
  pt("rays", V + 180, { tf: "rotate(0deg) scale(0.6)", op: 0, e: E.out });
  pt("rays", V + 520, { tf: "rotate(14deg) scale(1)", op: T.rays ? 0.95 : 0.5, e: "linear" });
  pt("rays", V + 1500, { tf: "rotate(46deg) scale(1.12)", op: 0 });
  pt(`seal${winnerBanner}` as Track, V + 1180, { tf: "scale(1)", e: E.out });
  pt(`seal${winnerBanner}` as Track, V + 1300, { tf: "scale(1.3)", e: C.snap });
  pt(`seal${winnerBanner}` as Track, V + 1620, { tf: "scale(1)" });
  pt(`halo${winnerBanner}` as Track, V + 1180, { op: 0, e: E.out });
  pt(`halo${winnerBanner}` as Track, V + 1300, { op: 1, e: E.inOut });
  pt(`halo${winnerBanner}` as Track, V + 1900, { op: 0.55 });
  sfx(V + 260, "stamp", 0.85);

  // Le pot : la fuda du perdant glisse vers celle du gagnant
  const P = V + 380;
  const [moving, staying, from, to, sTo]: [Track, Track, number, number, number] = win ? ["cardT", "cardM", -104, 112, 104] : ["cardM", "cardT", 104, -112, -104];
  const sign = win ? 1 : -1;
  pt(moving, P, { tf: cardTf(0, from, 2, 0), e: "cubic-bezier(0.3, 0, 0.5, 1)" });
  pt(moving, P + 240, { tf: cardTf(6, (from + to) / 2, 64, 6 * sign), e: C.pop });
  pt(moving, P + 600, { tf: cardTf(8, to - 6 * sign, 10, 7 * sign) });
  pt(staying, P + 160, { tf: cardTf(0, sTo, 2, 0), e: C.pop });
  pt(staying, P + 560, { tf: cardTf(-5, sTo + 8 * sign, 4, -4 * sign) });
  const [winnerTrack, loserTrack, glow]: [Track, Track, Track] = win ? ["bannerM", "bannerT", "glowM"] : ["bannerT", "bannerM", "glowT"];
  pt(loserTrack, P + 80, { op: 1, e: E.inOut });
  pt(loserTrack, P + 420, { op: 0.5 });
  pt(winnerTrack, P + 80, { tf: "translate(0px, 0px) rotate(0deg)", e: C.snap });
  pt(winnerTrack, P + 420, { tf: "translate(0px, 0px) rotate(-1.5deg)" });
  pt(glow, P + 80, { op: 0, e: E.out });
  pt(glow, P + 420, { op: 1 });
  sfx(P, "whoosh", 0.4);
  sfx(P + 600, "flip", 0.4);

  // 勝 ou 負 sur un trait de sumi, puis la tablette du résultat
  const O = P + 250;
  const Tb = O + 1000;
  pt("outro", O, { op: 0, e: "ease-out" });
  pt("outro", O + 500, { op: 1 });
  pt("swash", O + 120, { tf: "scaleX(0.05)", op: 0, e: "cubic-bezier(0.3, 0.7, 0.2, 1)" });
  pt("swash", O + 140, { op: 1, e: "cubic-bezier(0.3, 0.7, 0.2, 1)" });
  pt("swash", O + 520, { tf: "scaleX(1)", op: 1 });
  pt("okk", O + 330, { tf: "scale(1.7)", op: 0, e: "cubic-bezier(0.55, 0, 0.85, 0.4)" });
  pt("okk", O + 560, { tf: "scale(0.95)", op: 1, e: C.snap });
  pt("okk", O + 820, { tf: "scale(1)", op: 1 });
  pt("olabel", O + 760, { tf: "translateY(14px) scale(0.92)", op: 0, e: E.out });
  pt("olabel", O + 1300, { tf: "translateY(0px) scale(1)", op: 1 });
  pt("ov", Tb, { tf: "translateY(0px) scale(1)", e: E.out });
  pt("ov", Tb + 420, { tf: "translateY(-204px) scale(0.55)" });
  pt("tablet", Tb, { tf: "translateY(40%)", op: 0, e: C.tablet });
  pt("tablet", Tb + 520, { tf: "translateY(0%)", op: 1 });
  if (win) {
    if (T.taiko) sfx(O + 330, "taiko", 0.6);
    if (T.rays) sfx(O + 380, "boom", 0.35);
    sfx(O + 560, "chime", 0.5);
  } else {
    sfx(O + 400, "bell", 0.22);
  }
  sfx(O + 140, "brush", 0.4);
  sfx(Tb, "whoosh", 0.25);

  sounds.sort((a, b) => a.t - b.t);
  return { points, coinOpacity, sounds, verdictAt: V, settleAt: Tb + 520, landedAt: landed };
}

export type Keyframes = { keyframes: Keyframe[]; delay: number; duration: number };

/** Points d'un élément → keyframes Web Animations (les valeurs absentes reprennent la précédente). */
export function toKeyframes(list: readonly Point[], base: Base, withOpacity: boolean): Keyframes {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  let tf = base.tf;
  let op = base.op;
  const filled = sorted.map((p) => {
    if (p.tf !== undefined) tf = p.tf;
    if (p.op !== undefined) op = p.op;
    return { t: p.t, tf, op, e: p.e };
  });
  const t0 = filled[0].t;
  const t1 = filled[filled.length - 1].t;
  const duration = Math.max(1, t1 - t0);
  const keyframes: Keyframe[] = filled.map((p) => {
    const k: Keyframe = { offset: t1 === t0 ? 1 : (p.t - t0) / duration, transform: p.tf };
    if (withOpacity) k.opacity = p.op;
    if (p.e) k.easing = p.e;
    return k;
  });
  if (keyframes.length === 1) keyframes.unshift({ ...keyframes[0], offset: 0 });
  return { keyframes, delay: t0, duration };
}

/** Opacité seule (faces et tranche de la pièce). */
export function opacityKeyframes(list: readonly Point[]): Keyframes {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const t0 = sorted[0].t;
  const t1 = sorted[sorted.length - 1].t;
  const duration = Math.max(1, t1 - t0);
  const keyframes: Keyframe[] = sorted.map((p) => {
    const k: Keyframe = { offset: t1 === t0 ? 1 : (p.t - t0) / duration, opacity: p.op };
    if (p.e) k.easing = p.e;
    return k;
  });
  if (keyframes.length === 1) keyframes.unshift({ ...keyframes[0], offset: 0 });
  return { keyframes, delay: t0, duration };
}

/** Graine stable tirée d'un id de table (FNV-1a). */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  return h >>> 0;
}
