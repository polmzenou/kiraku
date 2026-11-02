import { describe, expect, it } from "vitest";
import { mangaStrokes } from "./manga-brush";
import { REVEAL_SCENES, REVEAL_SCENE_KEYS, revealSceneKey, xrGeometry } from "./reveal-scenes";

describe("déroulé des révélations", () => {
  it("chaque scène se retourne avant sa fin, et ses sons passent avant le retournement", () => {
    for (const key of REVEAL_SCENE_KEYS) {
      const scene = REVEAL_SCENES[key];
      expect(scene.charge).toBeLessThan(scene.total);
      for (const [at] of scene.cues) expect(at).toBeLessThan(scene.charge);
      expect(scene.frontCues.length).toBeGreaterThan(0);
    }
  });
  it("seules les raretés visuelles ont une scène, et seulement avec le retournement", () => {
    for (const key of REVEAL_SCENE_KEYS) expect(revealSceneKey(key)).toBe(key);
    for (const rarity of ["COMMON", "LEGENDARY", "MYTHIC", "AR", "GOLD", "INCONNUE"]) expect(revealSceneKey(rarity)).toBeNull();
    expect(revealSceneKey("BR", "fade")).toBeNull();
    expect(revealSceneKey("XR", "zoom")).toBeNull();
    expect(revealSceneKey("XR", "flip")).toBe("XR");
  });
  it("la XR garde son nom entier et n'a pas de sceau géant : son 極 joue ce rôle", () => {
    expect(REVEAL_SCENES.XR.hanko).toBeNull();
    expect(REVEAL_SCENES.BR.flash).toBe(false);
    expect(REVEAL_SCENES.MR.paper).toBe(true);
  });
});

describe("le X de la XR", () => {
  const points = (clip: string) => [...clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
  // Un point est dans le triangle s'il est du même côté des trois arêtes
  const inside = ([a, b, c]: number[][], [x, y]: number[]) => {
    const side = (p: number[], q: number[]) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const s = [side(a, b), side(b, c), side(c, a)];
    return s.every((n) => n >= 0) || s.every((n) => n <= 0);
  };

  it.each([[375, 812, 187.5, 340], [1280, 800, 640, 336], [320, 568, 100, 200]])("%i×%i : les quatre triangles partent de la carte et couvrent l'écran", (w, h, cx, cy) => {
    const { panes } = xrGeometry(w, h, cx, cy);
    expect(panes).toHaveLength(4);
    const triangles = panes.map((pane) => points(pane.clip));
    for (const triangle of triangles) expect(triangle[0]).toEqual([cx, cy]);
    for (const corner of [[0, 0], [w, 0], [w, h], [0, h], [w / 2, 0], [0, h / 2]]) {
      expect(triangles.some((triangle) => inside(triangle, corner))).toBe(true);
    }
  });
  it("les triangles partent chacun de leur côté, assez loin pour quitter l'écran", () => {
    const { panes } = xrGeometry(375, 812, 187, 340);
    expect(panes.map((p) => [Math.sign(p.tx), Math.sign(p.ty)])).toEqual([[0, -1], [1, 0], [0, 1], [-1, 0]]);
    for (const pane of panes) expect(Math.hypot(pane.tx, pane.ty)).toBeGreaterThan(812);
  });
});

describe("le mot MANGA au pinceau", () => {
  const strokes = mangaStrokes();
  it("écrit quinze traits l'un après l'autre, et finit avant que le mot éclate", () => {
    expect(strokes).toHaveLength(15);
    for (let i = 1; i < strokes.length; i++) expect(strokes[i].at).toBeGreaterThanOrEqual(strokes[i - 1].at + strokes[i - 1].duration);
    const last = strokes[strokes.length - 1];
    expect(last.at + last.duration).toBeLessThanOrEqual(2400);
    expect(new Set(strokes.map((s) => s.id)).size).toBe(15);
  });
  it("reste dans sa boîte et donne le même tracé à chaque appel", () => {
    for (const stroke of strokes) {
      for (const n of (stroke.body.match(/-?[\d.]+/g) ?? []).map(Number)) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThan(-20);
        expect(n).toBeLessThan(1030);
      }
    }
    expect(mangaStrokes()).toBe(strokes);
  });
});
