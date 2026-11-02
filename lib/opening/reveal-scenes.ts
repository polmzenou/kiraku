import type { Rarity } from "@/lib/catalog/rarity";
import type { SoundName } from "@/lib/sound/synth";

// Révélations propres aux raretés visuelles : tout se joue depuis le début de la charge (instant zéro),
// le retournement arrive à `charge` et la scène s'achève à `total`. Durées en ms.

export const REVEAL_SCENE_KEYS = ["BR", "MR", "VR", "XR"] as const;
export type RevealSceneKey = (typeof REVEAL_SCENE_KEYS)[number];

type Cue = [at: number, sound: SoundName, haptic?: number | number[]];
type FrontCue = [sound: SoundName, haptic?: number | number[]];
type Easing = "easeInOut" | [number, number, number, number];

export type RevealScene = {
  /** La carte passe à l'endroit à cet instant. */
  charge: number;
  /** Fin de la mise en scène : l'interface du rituel revient. */
  total: number;
  flip: { duration: number; ease?: Easing };
  /** Sceau géant, compté depuis le retournement ; null : la scène a le sien. */
  hanko: number | null;
  hankoColor?: string;
  /** Sceau net sur une page blanche, sans lueur. */
  paper?: boolean;
  /** Éclair du grand moment. */
  flash: boolean;
  /** Nom de la rareté, compté depuis le retournement. */
  title: number;
  cues: Cue[];
  frontCues: FrontCue[];
};

export const REVEAL_SCENES: Record<RevealSceneKey, RevealScene> = {
  // Brouillard noir : la carte se retourne cachée dans la fumée
  BR: {
    charge: 1900, total: 4900, flip: { duration: 0.35, ease: "easeInOut" }, hanko: 350, flash: false, title: 580,
    cues: [[0, "taiko", [80]], [1760, "taiko", [60]]],
    frontCues: [["stamp", 40]],
  },
  // MANGA au pinceau : le mot éclate, puis la carte se retourne
  MR: {
    charge: 2420, total: 4900, flip: { duration: 0.42, ease: [0.2, 0.9, 0.3, 1.1] }, hanko: 220, hankoColor: "#c8372d", paper: true, flash: false, title: 1060,
    cues: [[0, "whoosh"], [320, "tear", 10], [760, "tear", 10], [1130, "tear", 10], [1500, "tear", 10], [1800, "tear", 10]],
    frontCues: [["boom", [60]], ["stamp", 40]],
  },
  // Lumière divine : le faisceau descend du haut de l'écran
  VR: {
    charge: 2200, total: 5200, flip: { duration: 0.8, ease: [0.45, 0, 0.2, 1] }, hanko: 450, flash: true, title: 600,
    cues: [[250, "chime"], [1100, "bell", 20]],
    frontCues: [["chime", [30, 40, 30]], ["bell", 20]],
  },
  // L'écran coupé en X : à la charge, la carte s'écrase au premier plan
  XR: {
    charge: 2790, total: 5700, flip: { duration: 0 }, hanko: null, flash: false, title: 290,
    cues: [[350, "taiko", [40]], [700, "taiko", [60]], [1000, "clap", [30]], [1250, "clap", [50]], [1450, "launch"]],
    frontCues: [["boom", [80, 40, 120]], ["stamp", 60], ["crackle"]],
  },
};

const isSceneKey = (rarity: Rarity): rarity is RevealSceneKey => (REVEAL_SCENE_KEYS as readonly string[]).includes(rarity);

/** Scène d'une rareté ; une carte réglée en fondu ou en zoom dans l'admin garde son apparition simple. */
export function revealSceneKey(rarity: Rarity, reveal: string = "flip"): RevealSceneKey | null {
  return reveal === "flip" && isSceneKey(rarity) ? rarity : null;
}

/** Générateur stable : pas de hasard au rendu, la même scène à chaque ouverture. */
export const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Le X de la XR : deux lames qui se croisent sur la carte, parallèles aux diagonales de l'écran, et les
 * quatre triangles de la scène qui s'écartent le long de ces lames. Tout est en px depuis le coin de l'écran.
 */
export function xrGeometry(width: number, height: number, cx: number, cy: number) {
  const reach = Math.hypot(width, height) * 2, angle = Math.atan2(height, width);
  const dx = Math.cos(angle) * reach, dy = Math.sin(angle) * reach;
  const wedge = ([x1, y1]: [number, number], [x2, y2]: [number, number]) =>
    `polygon(${round(cx)}px ${round(cy)}px, ${round(cx + x1)}px ${round(cy + y1)}px, ${round(cx + x2)}px ${round(cy + y2)}px)`;
  const far = Math.max(width, height) * 1.5;
  return {
    angle: round((angle * 180) / Math.PI),
    panes: [
      { clip: wedge([-dx, -dy], [dx, -dy]), tx: 0, ty: -far, rotate: -7 },
      { clip: wedge([dx, -dy], [dx, dy]), tx: far, ty: 0, rotate: 6 },
      { clip: wedge([dx, dy], [-dx, dy]), tx: 0, ty: far, rotate: 7 },
      { clip: wedge([-dx, dy], [-dx, -dy]), tx: -far, ty: 0, rotate: -6 },
    ],
  };
}
