import { describe, expect, it } from "vitest";
import { BASE, flipCurves, flipFx, flipScript, opacityKeyframes, seedOf, springCurve, toKeyframes, type ScriptInput } from "./choreography";

const base: ScriptInput = {
  result: "OMOTE",
  topSide: "OMOTE",
  bottomWins: false,
  choreography: "toss",
  fx: flipFx(5),
  curves: flipCurves(false),
  seed: seedOf("cmi3k9x2f0007p4sh2ka7rq1"),
};

/** Dernier angle rotateX de la pièce : la face visible quand elle s'immobilise. */
function finalTilt(input: ScriptInput): number {
  const tilt = flipScript(input).points.get("tilt")!;
  const last = [...tilt].sort((a, b) => a.t - b.t).at(-1)!;
  return Number(/rotateX\((-?[\d.]+)deg\)/.exec(last.tf!)![1]);
}
const faceUp = (angle: number) => (((Math.round(angle) % 360) + 360) % 360 === 0 ? "OMOTE" : "URA");

describe("la pièce retombe sur la face tirée", () => {
  for (const choreography of ["toss", "spin"] as const) {
    for (const result of ["OMOTE", "URA"] as const) {
      it(`${choreography} → ${result}`, () => {
        for (let level = 0; level <= 6; level++) {
          for (const seed of [1, 2, 3, 42, 99]) {
            const angle = finalTilt({ ...base, choreography, result, fx: flipFx(level), seed });
            expect(Math.abs(angle) % 180).toBe(0);
            expect(faceUp(angle)).toBe(result);
          }
        }
      });
    }
  }
});

describe("déroulé", () => {
  it("les instants clés se suivent : retombée, sceau, tablette", () => {
    for (const choreography of ["toss", "spin"] as const) {
      const s = flipScript({ ...base, choreography });
      expect(s.landedAt).toBeGreaterThan(1000);
      expect(s.verdictAt).toBeGreaterThan(s.landedAt - 300);
      expect(s.settleAt).toBeGreaterThan(s.verdictAt);
    }
  });

  it("plus le pot est rare, plus le suspense dure", () => {
    const at = [0, 3, 5, 6].map((level) => flipScript({ ...base, fx: flipFx(level) }).settleAt);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at[0]).toBeLessThan(at[3]);
  });

  it("les sons sont rangés dans l'ordre et le taiko n'accompagne que les gros pots gagnés", () => {
    const won = flipScript({ ...base, bottomWins: true });
    expect(won.sounds.map((s) => s.t)).toEqual([...won.sounds.map((s) => s.t)].sort((a, b) => a - b));
    expect(won.sounds.some((s) => s.name === "taiko")).toBe(true);
    expect(flipScript({ ...base, bottomWins: false }).sounds.some((s) => s.name === "taiko")).toBe(false);
    expect(flipScript({ ...base, bottomWins: true, fx: flipFx(1) }).sounds.some((s) => s.name === "taiko")).toBe(false);
  });

  it("le pot file vers le gagnant : sa fuda reste, celle du perdant le rejoint", () => {
    const toBottom = flipScript({ ...base, bottomWins: true });
    const moving = [...toBottom.points.get("cardT")!].sort((a, b) => a.t - b.t).at(-1)!;
    expect(moving.tf).toMatch(/translate3d\(8px, 106px/);
    const toTop = flipScript({ ...base, bottomWins: false });
    expect([...toTop.points.get("cardM")!].sort((a, b) => a.t - b.t).at(-1)!.tf).toMatch(/translate3d\(8px, -106px/);
  });

  it("même table, même lancer", () => {
    expect(JSON.stringify([...flipScript(base).points])).toBe(JSON.stringify([...flipScript(base).points]));
  });
});

describe("keyframes", () => {
  it("complète les valeurs absentes avec la précédente et décale le départ", () => {
    const k = toKeyframes([{ t: 100, tf: "scale(1)", op: 0 }, { t: 300, op: 1 }], BASE.hanko, true);
    expect(k).toMatchObject({ delay: 100, duration: 200 });
    expect(k.keyframes).toEqual([
      { offset: 0, transform: "scale(1)", opacity: 0 },
      { offset: 1, transform: "scale(1)", opacity: 1 },
    ]);
  });

  it("sans opacité pour les éléments en 3D, un point seul devient un état tenu", () => {
    const k = toKeyframes([{ t: 50, tf: "none" }], BASE.coin, false);
    expect(k.keyframes).toHaveLength(2);
    expect(k.keyframes.every((f) => !("opacity" in f))).toBe(true);
    expect(opacityKeyframes([{ t: 0, op: 0 }, { t: 10, op: 1, e: "ease" }]).keyframes[1]).toMatchObject({ opacity: 1, easing: "ease" });
  });

  it("courbes de ressort en linear(), qui finissent à 1", () => {
    const c = springCurve(0.42);
    expect(c.startsWith("linear(0, ")).toBe(true);
    expect(c.endsWith(", 1)")).toBe(true);
    // Un ressort peu amorti dépasse sa cible
    expect(Math.max(...c.slice(7, -1).split(", ").map(Number))).toBeGreaterThan(1);
    expect(flipCurves(false).snap).toMatch(/^cubic-bezier/);
  });

  it("graine stable par table", () => {
    expect(seedOf("abc")).toBe(seedOf("abc"));
    expect(seedOf("abc")).not.toBe(seedOf("abd"));
  });
});
