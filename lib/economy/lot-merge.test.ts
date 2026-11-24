import { describe, expect, it } from "vitest";
import { mergeLots } from "./lot-merge";

type Line = { kind: string; quantity: number; slug: string };
type Lot = { id: string; name: string; zeni: number; lines: Line[] };
const keyOf = (l: Line) => `${l.kind}:${l.slug}`;
const lot = (id: string, zeni: number, ...lines: [string, number][]): Lot => ({
  id,
  name: id,
  zeni,
  lines: lines.map(([slug, quantity]) => ({ kind: "BOOSTER", slug, quantity })),
});

describe("mergeLots", () => {
  it("rend null sans lot, et le lot tel quel s'il est seul", () => {
    expect(mergeLots<Line, Lot>([], keyOf)).toBeNull();
    expect(mergeLots<Line, Lot>([null, null], keyOf)).toBeNull();
    const one = lot("a", 10, ["std", 5]);
    expect(mergeLots([null, one], keyOf)).toBe(one);
  });

  it("additionne les Zeni et réunit les lignes identiques, dans l'ordre d'arrivée", () => {
    const merged = mergeLots([lot("a", 1000, ["std", 5], ["myth", 1]), null, lot("b", 500, ["myth", 1], ["jub", 2])], keyOf);
    expect(merged).toEqual({
      id: "a+b",
      name: "a",
      zeni: 1500,
      lines: [
        { kind: "BOOSTER", slug: "std", quantity: 5 },
        { kind: "BOOSTER", slug: "myth", quantity: 2 },
        { kind: "BOOSTER", slug: "jub", quantity: 2 },
      ],
    });
  });

  it("ne modifie pas les lots reçus", () => {
    const a = lot("a", 0, ["myth", 1]);
    const b = lot("b", 0, ["myth", 1]);
    mergeLots([a, b], keyOf);
    expect(a.lines[0].quantity).toBe(1);
    expect(b.lines[0].quantity).toBe(1);
  });
});
