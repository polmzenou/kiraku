import type { ArenaId } from "@/lib/battle/arenas";
import type { BattleSound } from "@/lib/battle/choreography";
import { audio, burst, noise, tone } from "./synth";

// Sons du combat, synthétisés en Web Audio (aucun fichier à charger) et chargés à la demande. Bus
// commun : compresseur, puis réverbération générée (bruit qui décroît) pour donner de l'ampleur aux
// coups. Chaque arène a son ambiance : un fond (grillons, cigales, vent…) et une musique générative de
// koto, des phrases tirées au fil de l'eau dans une gamme japonaise (in, yo ou hirajōshi).

type Bus = { sfx: GainNode; bed: GainNode; music: GainNode; wet: GainNode };
let bus: Bus | null = null;

function reverb(ac: AudioContext, seconds: number): ConvolverNode {
  const length = Math.floor(ac.sampleRate * seconds);
  const ir = ac.createBuffer(2, length, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
  }
  const conv = ac.createConvolver();
  conv.buffer = ir;
  return conv;
}

function busFor(ac: AudioContext): Bus {
  if (bus) return bus;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ac.destination);
  const wet = ac.createGain();
  wet.gain.value = 0.22;
  const conv = reverb(ac, 2.4);
  wet.connect(conv).connect(comp);
  const mk = (v: number) => {
    const g = ac.createGain();
    g.gain.value = v;
    g.connect(comp);
    g.connect(wet);
    return g;
  };
  bus = { sfx: mk(0.9), bed: mk(0.32), music: mk(0.22), wet };
  return bus;
}

/** Corde pincée façon koto : partiels qui s'éteignent vite, petit glissé à l'attaque, attaque de plectre. */
function koto(ac: AudioContext, out: AudioNode, freq: number, at: number, peak = 0.16, bend = false) {
  [1, 2, 3, 4.02, 5.05].forEach((h, i) => {
    const osc = ac.createOscillator();
    osc.type = i === 0 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq * h * 1.006, at);
    osc.frequency.exponentialRampToValueAtTime(freq * h, at + 0.05);
    if (bend && i === 0) {
      osc.frequency.setValueAtTime(freq, at + 0.32);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.0595, at + 0.52);
    }
    const g = ac.createGain();
    const p = peak * [1, 0.45, 0.28, 0.16, 0.09][i];
    const decay = [2.2, 1.3, 0.9, 0.6, 0.45][i];
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(p, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  });
  burst(ac, out, at, { duration: 0.03, from: freq * 3, to: freq * 2, q: 3, peak: peak * 0.6 });
}

/** Coup de taiko : grave qui chute et peau frappée. */
function taiko(ac: AudioContext, out: AudioNode, at: number, peak = 0.9) {
  tone(ac, out, 118, at, { peak, decay: 0.75, to: 44 });
  burst(ac, out, at, { duration: 0.1, from: 700, to: 180, q: 0.6, peak: peak * 0.4 });
}

/** Joue un bruitage du combat. */
export function playBattleSound(name: BattleSound) {
  const ac = audio();
  if (!ac) return;
  const out = busFor(ac).sfx;
  const t = ac.currentTime + 0.01;
  switch (name) {
    case "swing":
      burst(ac, out, t, { duration: 0.2, from: 500, to: 2600, q: 0.9, peak: 0.2 });
      break;
    case "hit":
      tone(ac, out, 150, t, { peak: 0.7, decay: 0.22, to: 52 });
      burst(ac, out, t, { duration: 0.07, from: 2600, to: 700, q: 0.9, peak: 0.42 });
      break;
    case "heavy":
      tone(ac, out, 120, t, { peak: 0.9, decay: 0.36, to: 40 });
      tone(ac, out, 62, t, { peak: 0.5, decay: 0.5, to: 34 });
      burst(ac, out, t, { duration: 0.14, from: 1800, to: 260, q: 0.7, peak: 0.5 });
      break;
    case "crit":
      taiko(ac, out, t, 1);
      burst(ac, out, t, { duration: 0.16, from: 3200, to: 500, q: 0.7, peak: 0.55 });
      tone(ac, out, 1180, t, { type: "triangle", peak: 0.12, decay: 0.7 });
      tone(ac, out, 1770, t + 0.005, { peak: 0.07, decay: 0.55 });
      break;
    case "slash":
      burst(ac, out, t, { duration: 0.16, from: 3200, to: 7600, q: 2.4, peak: 0.32 });
      tone(ac, out, 2640, t + 0.02, { peak: 0.05, decay: 0.6 });
      break;
    case "pierce":
      tone(ac, out, 420, t, { type: "sawtooth", peak: 0.05, decay: 0.2, to: 1900 });
      burst(ac, out, t + 0.12, { duration: 0.1, from: 4200, to: 1200, q: 1.2, peak: 0.36 });
      tone(ac, out, 160, t + 0.12, { peak: 0.6, decay: 0.24, to: 50 });
      break;
    case "block":
      [620, 931, 1453].forEach((f, i) => tone(ac, out, f, t, { type: i ? "sine" : "triangle", peak: 0.13 - i * 0.03, decay: 0.32 - i * 0.05 }));
      burst(ac, out, t, { duration: 0.05, from: 3400, to: 2000, q: 2, peak: 0.3 });
      break;
    case "heal":
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(ac, out, f, t + i * 0.07, { peak: 0.09, decay: 0.9 }));
      break;
    case "poison":
      [320, 410, 360, 480].forEach((f, i) => tone(ac, out, f, t + i * 0.06, { peak: 0.08, decay: 0.09, to: f * 1.7 }));
      break;
    case "bubble":
      [520, 640, 590].forEach((f, i) => tone(ac, out, f, t + i * 0.09, { peak: 0.07, decay: 0.08, to: f * 1.8 }));
      break;
    case "seal":
      burst(ac, out, t, { duration: 0.05, from: 1900, to: 700, q: 1, peak: 0.45 });
      tone(ac, out, 190, t, { peak: 0.55, decay: 0.2, to: 70 });
      break;
    case "drum":
      taiko(ac, out, t, 0.85);
      break;
    case "barrier":
      [1568, 2349, 3136].forEach((f, i) => tone(ac, out, f, t + i * 0.05, { peak: 0.06, decay: 1.1 }));
      burst(ac, out, t, { duration: 0.6, from: 5000, to: 9000, q: 1.5, peak: 0.05 });
      break;
    case "gong":
      [98, 197, 263, 394, 529].forEach((f, i) => tone(ac, out, f, t, { peak: 0.24 / (i + 1), decay: 2.6 - i * 0.3 }));
      tone(ac, out, 70, t, { peak: 0.5, decay: 0.5, to: 38 });
      break;
    case "revive":
      tone(ac, out, 330, t, { peak: 0.1, decay: 0.9, to: 990 });
      [1319, 1760, 2637].forEach((f, i) => tone(ac, out, f, t + 0.3 + i * 0.08, { peak: 0.07, decay: 1 }));
      break;
    case "clack":
      tone(ac, out, 1250, t, { type: "triangle", peak: 0.34, decay: 0.11 });
      tone(ac, out, 1180, t + 0.1, { type: "triangle", peak: 0.3, decay: 0.11 });
      break;
    case "cutin":
      burst(ac, out, t, { duration: 0.32, from: 380, to: 3200, q: 0.8, peak: 0.22 });
      taiko(ac, out, t + 0.24, 0.7);
      break;
    case "wisp":
      tone(ac, out, 880, t, { peak: 0.05, decay: 0.45, to: 1320 });
      tone(ac, out, 1760, t + 0.05, { peak: 0.03, decay: 0.4 });
      break;
    case "flurry":
      burst(ac, out, t, { duration: 0.14, from: 700, to: 2800, q: 1, peak: 0.16 });
      burst(ac, out, t + 0.12, { duration: 0.14, from: 800, to: 3200, q: 1, peak: 0.14 });
      break;
    case "taunt":
      burst(ac, out, t, { duration: 0.36, from: 220, to: 130, q: 5, peak: 0.32 });
      break;
    case "orb":
      tone(ac, out, 1760, t, { peak: 0.06, decay: 0.25 });
      tone(ac, out, 2637, t + 0.01, { peak: 0.035, decay: 0.2 });
      break;
    case "timeout":
      tone(ac, out, 880, t, { peak: 0.08, decay: 0.8 });
      break;
    case "victory": {
      const notes = [293.66, 349.23, 392, 440, 523.25, 587.33];
      notes.forEach((f, i) => koto(ac, out, f, t + i * 0.09, 0.14));
      taiko(ac, out, t, 0.9);
      taiko(ac, out, t + 0.36, 0.8);
      [1568, 2093, 2637].forEach((f, i) => tone(ac, out, f, t + 0.6 + i * 0.1, { peak: 0.07, decay: 1.2 }));
      break;
    }
    case "defeat":
      [392, 329.63, 293.66, 220].forEach((f, i) => koto(ac, out, f, t + i * 0.28, 0.12, i === 3));
      tone(ac, out, 98, t + 0.6, { peak: 0.18, decay: 2.2 });
      break;
    case "draw":
      koto(ac, out, 293.66, t, 0.12);
      koto(ac, out, 440, t + 0.3, 0.12);
      break;
  }
}

// ---------- Ambiances ----------

type Scale = readonly number[];
/** Gammes en demi-tons au-dessus de la tonique. */
const IN: Scale = [0, 1, 5, 7, 8];
const YO: Scale = [0, 2, 5, 7, 9];
const HIRAJOSHI: Scale = [0, 2, 3, 7, 8];

type Bed = "crickets" | "cicadas" | "wind" | "room" | "rain" | "fire" | "crowd";
type Ambience = { beds: Bed[]; scale: Scale; root: number; bpm: number; density: number };

const AMBIENCE: Record<ArenaId, Ambience> = {
  dojo: { beds: ["room", "crickets"], scale: IN, root: 146.83, bpm: 62, density: 0.45 },
  chikurin: { beds: ["wind", "crickets"], scale: HIRAJOSHI, root: 164.81, bpm: 56, density: 0.35 },
  torii: { beds: ["wind", "cicadas"], scale: YO, root: 196, bpm: 70, density: 0.5 },
  suiu: { beds: ["rain"], scale: IN, root: 174.61, bpm: 58, density: 0.4 },
  tenshu: { beds: ["wind", "rain"], scale: HIRAJOSHI, root: 130.81, bpm: 84, density: 0.55 },
  himatsuri: { beds: ["fire", "crowd"], scale: YO, root: 220, bpm: 96, density: 0.65 },
  takamagahara: { beds: ["wind"], scale: YO, root: 261.63, bpm: 52, density: 0.3 },
};

type Running = { stop: () => void; music: (on: boolean) => void };
let running: Running | null = null;

/** Bruit en boucle filtré, dont le volume ondule lentement (vent, pièce, pluie, feu, foule). */
function loopBed(ac: AudioContext, out: AudioNode, kind: Bed): () => void {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  src.loop = true;
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  const lfo = ac.createOscillator();
  const depth = ac.createGain();
  const settings: Record<Bed, { type: BiquadFilterType; f: number; q: number; gain: number; lfo: number; depth: number }> = {
    room: { type: "lowpass", f: 260, q: 0.5, gain: 0.25, lfo: 0.05, depth: 0.08 },
    wind: { type: "bandpass", f: 520, q: 0.6, gain: 0.28, lfo: 0.09, depth: 0.2 },
    rain: { type: "highpass", f: 1800, q: 0.4, gain: 0.16, lfo: 0.13, depth: 0.04 },
    fire: { type: "lowpass", f: 900, q: 0.8, gain: 0.18, lfo: 0.6, depth: 0.08 },
    crowd: { type: "bandpass", f: 700, q: 0.9, gain: 0.2, lfo: 0.07, depth: 0.12 },
    crickets: { type: "lowpass", f: 200, q: 0.5, gain: 0, lfo: 0.1, depth: 0 },
    cicadas: { type: "lowpass", f: 200, q: 0.5, gain: 0, lfo: 0.1, depth: 0 },
  };
  const s = settings[kind];
  filter.type = s.type;
  filter.frequency.value = s.f;
  filter.Q.value = s.q;
  g.gain.value = s.gain;
  lfo.frequency.value = s.lfo;
  depth.gain.value = s.depth;
  lfo.connect(depth).connect(g.gain);
  src.connect(filter).connect(g).connect(out);
  src.start();
  lfo.start();
  return () => {
    try {
      src.stop();
      lfo.stop();
    } catch {
      // déjà arrêté
    }
  };
}

/** Grillons : stridulations brèves en rafales ; cigales du soir : appels qui descendent. */
function insects(ac: AudioContext, out: AudioNode, kind: "crickets" | "cicadas", at: number, step: number) {
  if (kind === "crickets") {
    if (step % 3 === 2) return;
    for (let k = 0; k < 4; k++) tone(ac, out, 4300 + (step % 2) * 180, at + k * 0.05, { peak: 0.018, decay: 0.03 });
  } else if (step % 8 === 0) {
    for (let k = 0; k < 7; k++) tone(ac, out, 3600 - k * 90, at + k * 0.11, { peak: 0.016, decay: 0.09 });
  }
}

/** Démarre l'ambiance d'une arène (remplace la précédente). */
export function startAmbience(arena: ArenaId, music: boolean) {
  stopAmbience();
  const ac = audio();
  if (!ac) return;
  const b = busFor(ac);
  const cfg = AMBIENCE[arena];
  const stops = cfg.beds.map((bed) => loopBed(ac, b.bed, bed));
  b.bed.gain.setTargetAtTime(0.32, ac.currentTime, 0.8);
  b.music.gain.setTargetAtTime(music ? 0.22 : 0, ac.currentTime, 0.4);

  // Séquenceur à anticipation : chaque pas programme ses notes un peu à l'avance
  const beat = 60 / cfg.bpm / 2;
  let next = ac.currentTime + 0.4;
  let step = 0;
  let degree = 2;
  let seed = 0x9e3779b1 ^ Math.round(cfg.root * 100);
  const rand = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((seed ^ (seed >>> 13)) >>> 0) / 4_294_967_296;
  };
  const freq = (d: number) => {
    const oct = Math.floor(d / cfg.scale.length);
    const i = ((d % cfg.scale.length) + cfg.scale.length) % cfg.scale.length;
    return cfg.root * 2 ** (oct + cfg.scale[i] / 12);
  };
  const tick = () => {
    while (next < ac.currentTime + 0.6) {
      for (const bed of cfg.beds) if (bed === "crickets" || bed === "cicadas") insects(ac, b.bed, bed, next, step);
      const bar = step % 16;
      // Une phrase par mesure de 16 pas, silences compris : marche aléatoire sur la gamme
      if (bar < 12 && rand() < cfg.density) {
        degree = Math.max(0, Math.min(9, degree + [-2, -1, -1, 1, 1, 2, 0][Math.floor(rand() * 7)]));
        koto(ac, b.music, freq(degree), next, 0.12 + rand() * 0.05, rand() < 0.12);
        if (rand() < 0.18) koto(ac, b.music, freq(degree - 2) / 2, next, 0.08);
      }
      if (bar === 0) koto(ac, b.music, cfg.root / 2, next, 0.1);
      if (arena === "takamagahara" && bar === 0) [0, 7, 14, 16].forEach((st) => tone(ac, b.music, cfg.root * 2 ** (st / 12), next, { peak: 0.025, decay: beat * 14 }));
      next += beat;
      step++;
    }
  };
  tick();
  const id = setInterval(tick, 200);
  running = {
    stop: () => {
      clearInterval(id);
      b.bed.gain.setTargetAtTime(0, ac.currentTime, 0.3);
      const end = stops;
      setTimeout(() => end.forEach((s) => s()), 1_200);
    },
    music: (on) => b.music.gain.setTargetAtTime(on ? 0.22 : 0, ac.currentTime, 0.4),
  };
}

export function setAmbienceMusic(on: boolean) {
  running?.music(on);
}

export function stopAmbience() {
  running?.stop();
  running = null;
}
