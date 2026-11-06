import { describe, expect, it } from "vitest";
import { backdropMode, canvasToBox, firstVisible, visibleCanvas } from "./arena-backdrop";

describe("backdropMode", () => {
  it("joue la vidéo en effets complets ou allégés", () => {
    expect(backdropMode("full", false)).toBe("video");
    expect(backdropMode("lite", false)).toBe("video");
  });

  it("garde l'image fixe en mouvement réduit ou en économie de données", () => {
    expect(backdropMode("reduced", false)).toBe("still");
    expect(backdropMode("full", true)).toBe("still");
    expect(backdropMode("lite", true)).toBe("still");
  });
});

describe("canvasToBox", () => {
  it("cadre la colonne centrale sur un téléphone en portrait", () => {
    // 390 × 844 : la toile prend toute la hauteur, on en voit x ≈ 392 → 808
    const center = canvasToBox(390, 844, 600, 450);
    expect(center.x).toBeCloseTo(195);
    expect(center.y).toBeCloseTo(422);
    expect(center.s).toBeCloseTo(844 / 900);
    expect(canvasToBox(390, 844, 392, 0).x).toBeCloseTo(0, 0);
    expect(canvasToBox(390, 844, 808, 900).x).toBeCloseTo(390, 0);
    expect(canvasToBox(390, 844, 600, 0).y).toBeCloseTo(0);
  });

  it("cadre toute la largeur sur un écran 16:9, haut et bas rognés", () => {
    const s = 1440 / 1200;
    expect(canvasToBox(1440, 810, 0, 450).x).toBeCloseTo(0);
    expect(canvasToBox(1440, 810, 1200, 450).x).toBeCloseTo(1440);
    // Haut visible : y = 450 − 405 / s
    expect(canvasToBox(1440, 810, 600, 450 - 405 / s).y).toBeCloseTo(0);
    expect(canvasToBox(1440, 810, 600, 450).s).toBeCloseTo(s);
  });

  it("donne la partie visible de la toile : colonne centrale sur téléphone, bande centrale en 16:9", () => {
    const phone = visibleCanvas(390, 844);
    expect(phone.x0).toBeCloseTo(392.1, 1);
    expect(phone.x1).toBeCloseTo(807.9, 1);
    expect(phone.y0).toBeCloseTo(0);
    expect(phone.y1).toBeCloseTo(900);
    const desktop = visibleCanvas(1440, 810);
    expect(desktop.x0).toBeCloseTo(0);
    expect(desktop.x1).toBeCloseTo(1200);
    expect(desktop.y0).toBeCloseTo(112.5);
    expect(desktop.y1).toBeCloseTo(787.5);
  });

  it("choisit le premier point vraiment visible, ou le dernier de la liste", () => {
    const keep = { x: 515, y: 70 };
    const turret = { x: 112, y: 185 };
    const gable = { x: 600, y: 210 };
    // Téléphone : le haut du donjon se voit ; les tourelles sont hors champ
    expect(firstVisible([keep, turret, gable], visibleCanvas(390, 844))).toBe(keep);
    // 16:9 : le haut du donjon passe au-dessus du cadre, les tourelles se voient
    expect(firstVisible([keep, turret, gable], visibleCanvas(1440, 810))).toBe(turret);
    // Écran très large : rien ne passe, on retombe sur le dernier point
    expect(firstVisible([keep, turret], visibleCanvas(2560, 1080))).toBe(turret);
  });

  it("suit la formule CSS de .arena-prop : 50 % + (px − 600) × s", () => {
    for (const [w, h] of [[375, 667], [768, 1024], [1920, 1080]] as const) {
      const s = Math.max(w / 1200, h / 900);
      const p = canvasToBox(w, h, 415, 400);
      expect(p.x).toBeCloseTo(w / 2 + (415 - 600) * s);
      expect(p.y).toBeCloseTo(h / 2 + (400 - 450) * s);
    }
  });
});
