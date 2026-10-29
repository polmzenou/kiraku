// Sons de l'ouverture, synthétisés en Web Audio : aucun fichier à charger. Le contexte audio n'est
// créé qu'au premier geste du joueur (règle des navigateurs) et seulement si le son est activé.

export type SoundName =
  | "tear"
  | "flip"
  | "clack"
  | "bell"
  | "chime"
  | "taiko"
  | "stamp"
  | "whoosh"
  // Boutique : offrande et feu d'artifice
  | "coin"
  | "clap"
  | "launch"
  | "boom"
  | "crackle";

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Contexte audio partagé (ouverture, boutique, combat), créé au premier son. */
export function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Crée ou réveille le contexte audio pendant le geste du joueur : un son joué après une réponse
 * réseau (achat en boutique) arrive hors du geste, et Safari laisserait alors le contexte suspendu.
 */
export function primeAudio(): void {
  audio();
}

export function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const length = Math.floor(ac.sampleRate * 1.2);
  noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Enveloppe percussive : attaque courte puis décroissance exponentielle. */
export function envelope(ac: AudioContext, peak: number, attack: number, decay: number, at: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

export function tone(ac: AudioContext, out: AudioNode, freq: number, at: number, opts: { type?: OscillatorType; peak?: number; decay?: number; to?: number }) {
  const osc = ac.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, at);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + (opts.decay ?? 0.3));
  const g = envelope(ac, opts.peak ?? 0.2, 0.005, opts.decay ?? 0.3, at);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + (opts.decay ?? 0.3) + 0.05);
}

export function burst(ac: AudioContext, out: AudioNode, at: number, opts: { duration: number; from: number; to: number; q?: number; peak?: number }) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = opts.q ?? 1.2;
  filter.frequency.setValueAtTime(opts.from, at);
  filter.frequency.exponentialRampToValueAtTime(opts.to, at + opts.duration);
  const g = envelope(ac, opts.peak ?? 0.25, 0.01, opts.duration, at);
  src.connect(filter).connect(g).connect(out);
  src.start(at);
  src.stop(at + opts.duration + 0.05);
}

/** Joue un son (sans effet si le Web Audio est indisponible). */
export function playSound(name: SoundName, volume = 0.6) {
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = volume;
  out.connect(ac.destination);
  const t = ac.currentTime + 0.01;

  switch (name) {
    case "tear": // papier washi qui se déchire : souffle filtré qui monte
      burst(ac, out, t, { duration: 0.35, from: 900, to: 4200, q: 0.8, peak: 0.35 });
      burst(ac, out, t + 0.08, { duration: 0.25, from: 2500, to: 6000, q: 2, peak: 0.15 });
      break;
    case "whoosh": // cartes qui sortent
      burst(ac, out, t, { duration: 0.4, from: 400, to: 1800, q: 0.7, peak: 0.18 });
      break;
    case "flip": // carte retournée : petit claquement sec
      burst(ac, out, t, { duration: 0.06, from: 3000, to: 1500, q: 3, peak: 0.3 });
      break;
    case "clack": // claquoir hyoshigi : deux coups de bois
      tone(ac, out, 1250, t, { type: "triangle", peak: 0.35, decay: 0.12 });
      tone(ac, out, 1180, t + 0.11, { type: "triangle", peak: 0.3, decay: 0.12 });
      break;
    case "bell": // clochette suzu : partiels inharmoniques
      for (const [f, p] of [
        [2093, 0.16],
        [3136, 0.09],
        [4699, 0.05],
      ] as const) {
        tone(ac, out, f, t, { peak: p, decay: 1.2 });
      }
      break;
    case "chime": // feuille d'or : arpège de clochettes
      [1568, 2093, 2637, 3136].forEach((f, i) => tone(ac, out, f, t + i * 0.09, { peak: 0.12, decay: 1.1 }));
      break;
    case "taiko": // tambour taiko : grave qui chute et peau frappée
      tone(ac, out, 120, t, { peak: 0.9, decay: 0.9, to: 48 });
      burst(ac, out, t, { duration: 0.12, from: 600, to: 200, q: 0.6, peak: 0.4 });
      tone(ac, out, 110, t + 0.32, { peak: 0.5, decay: 0.7, to: 46 });
      break;
    case "stamp": // sceau tamponné : coup sourd
      tone(ac, out, 180, t, { peak: 0.5, decay: 0.18, to: 70 });
      burst(ac, out, t, { duration: 0.05, from: 1200, to: 400, q: 1, peak: 0.2 });
      break;
    case "coin": // pièce de Zeni qui tinte en tombant dans la boîte à offrandes
      tone(ac, out, 2637, t, { peak: 0.12, decay: 0.16 });
      tone(ac, out, 3951, t + 0.004, { peak: 0.07, decay: 0.11 });
      break;
    case "clap": // claquement de mains (kashiwade) : bruit bref et sec
      burst(ac, out, t, { duration: 0.07, from: 1800, to: 900, q: 0.9, peak: 0.45 });
      break;
    case "launch": // fusée de feu d'artifice : sifflement qui grimpe
      tone(ac, out, 380, t, { peak: 0.06, decay: 0.55, to: 1600 });
      break;
    case "boom": // bouquet qui éclate : grave et souffle
      tone(ac, out, 70, t, { peak: 0.7, decay: 0.7, to: 36 });
      burst(ac, out, t, { duration: 0.9, from: 900, to: 140, q: 0.5, peak: 0.35 });
      break;
    case "crackle": // étincelles qui crépitent
      for (let i = 0; i < 12; i++) burst(ac, out, t + i * 0.05 + (i % 3) * 0.013, { duration: 0.025, from: 5200, to: 3800, q: 2, peak: 0.12 });
      break;
  }
}

/** Vibration courte (Android ; ignorée ailleurs). */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}
