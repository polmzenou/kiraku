import type { FxLevel } from "./choreography";

// Fond peint des arènes : image fixe ou vidéo en boucle, et passage des unités de la toile aux pixels
// d'un calque de la scène. La toile mesure 1200 × 900 et se cadre comme un `object-fit: cover` centré
// (même règle que `.arena-prop` dans components/battle/arenas/arena.css).

export const CANVAS = { w: 1200, h: 900 } as const;

export type BackdropMode = "video" | "still";

/** La vidéo, sauf en mouvement réduit ou quand le navigateur demande d'économiser les données. */
export function backdropMode(level: FxLevel, saveData: boolean): BackdropMode {
  return level === "reduced" || saveData ? "still" : "video";
}

/** Position en pixels, dans un calque de w × h, du point (px, py) de la toile ; s = pixels par unité. */
export function canvasToBox(w: number, h: number, px: number, py: number) {
  const s = Math.max(w / CANVAS.w, h / CANVAS.h);
  return { x: w / 2 + (px - CANVAS.w / 2) * s, y: h / 2 + (py - CANVAS.h / 2) * s, s };
}

export type CanvasView = { x0: number; x1: number; y0: number; y1: number };

/** La partie de la toile visible dans un calque de w × h, en unités de toile. */
export function visibleCanvas(w: number, h: number): CanvasView {
  const s = Math.max(w / CANVAS.w, h / CANVAS.h);
  const hw = w / 2 / s;
  const hh = h / 2 / s;
  return { x0: CANVAS.w / 2 - hw, x1: CANVAS.w / 2 + hw, y0: CANVAS.h / 2 - hh, y1: CANVAS.h / 2 + hh };
}

/**
 * Le premier point de la liste qui se voit vraiment : à `side` unités des bords gauche et droit, et à
 * `top` unités sous le haut visible (place de la barre du haut). Aucun : le dernier point de la liste.
 */
export function firstVisible<P extends { x: number; y: number }>(points: readonly P[], view: CanvasView, side = 30, top = 50): P {
  return points.find((p) => p.x >= view.x0 + side && p.x <= view.x1 - side && p.y >= view.y0 + top) ?? points[points.length - 1];
}
