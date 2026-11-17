import { describe, expect, it } from "vitest";
import { EMAKI_FRAME, EMAKI_IMAGE, sampleTrail, TRAIL, TRAIL_PATH, TRAIL_POINTS, TRAIL_STATIONS, trailPointAt, walkedPath } from "./trail";

describe("tracé du rouleau d'expédition", () => {
  it("part du premier point et arrive au dernier", () => {
    const [first, last] = [TRAIL_POINTS[0], TRAIL_POINTS[TRAIL_POINTS.length - 1]];
    expect(trailPointAt(0)).toMatchObject({ x: first[0], y: first[1], at: 0 });
    expect(trailPointAt(1)).toMatchObject({ x: last[0], y: last[1], at: 1 });
  });

  it("borne la progression et ignore une valeur invalide", () => {
    expect(trailPointAt(-1)).toMatchObject(trailPointAt(0));
    expect(trailPointAt(2)).toMatchObject(trailPointAt(1));
    expect(trailPointAt(Number.NaN)).toMatchObject(trailPointAt(0));
  });

  it("avance toujours dans le même sens", () => {
    for (let i = 1; i < TRAIL.length; i++) expect(TRAIL[i].at).toBeGreaterThan(TRAIL[i - 1].at);
    expect(TRAIL[0].at).toBe(0);
    expect(TRAIL[TRAIL.length - 1].at).toBe(1);
  });

  it("passe plus de temps sur la moitié lointaine du chemin", () => {
    // Deux moitiés de même longueur à l'écran ; la seconde est deux fois plus loin
    const samples = sampleTrail([[0, 0, 1], [100, 0, 1], [200, 0, 0.5]], 24);
    expect(samples[24].at).toBeLessThan(0.5);
    expect(trailPointAt(0.5, samples).x).toBeLessThan(200);
    expect(trailPointAt(0.5, samples).x).toBeGreaterThan(100);
  });

  it("allume les relais dans l'ordre, du départ à l'arrivée", () => {
    expect(TRAIL_STATIONS).toHaveLength(4);
    expect(TRAIL_STATIONS[0].at).toBe(0);
    expect(TRAIL_STATIONS[TRAIL_STATIONS.length - 1].at).toBe(1);
    for (let i = 1; i < TRAIL_STATIONS.length; i++) expect(TRAIL_STATIONS[i].at).toBeGreaterThan(TRAIL_STATIONS[i - 1].at);
  });

  it("reste dans la bande de l'image visible sur ordinateur, lanterne comprise", () => {
    // Rouleau le plus large : l'image prend toute la largeur, seule une bande centrale est visible
    const scale = EMAKI_FRAME.maxWidth / EMAKI_IMAGE.width;
    const band = EMAKI_FRAME.height / scale;
    const top = (EMAKI_IMAGE.height - band) / 2;
    const lantern = 34 / scale; // lanterne (28 px) et son décalage, en pixels de l'image
    const station = 12 / scale; // demi-relais (10 px) et une marge
    for (const p of TRAIL) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(EMAKI_IMAGE.width);
      expect(p.y - lantern).toBeGreaterThan(top);
      expect(p.y + station).toBeLessThan(top + band);
    }
  });

  it("trace le chemin parcouru jusqu'à la lanterne", () => {
    expect(TRAIL_PATH.startsWith(`M${TRAIL_POINTS[0][0]} ${TRAIL_POINTS[0][1]}`)).toBe(true);
    expect(walkedPath(0)).toMatch(/^M170 548 L170 548$/);
    const here = trailPointAt(0.5);
    expect(walkedPath(0.5).endsWith(`L${Math.round(here.x * 10) / 10} ${Math.round(here.y * 10) / 10}`)).toBe(true);
    expect(walkedPath(1)).toBe(TRAIL_PATH);
    expect(walkedPath(0.5)).not.toContain("NaN");
  });
});
