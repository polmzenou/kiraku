import { describe, expect, it } from "vitest";
import { cut, layoutTree, type TreeInput } from "./tree-layout";

const person = (key: string) => ({ key, name: key });
const kid = (key: string, grand = 0) => ({ person: person(key), kids: Array.from({ length: grand }, (_, i) => person(`${key}-${i}`)) });

describe("arbre des liens", () => {
  it("parrain au-dessus, joueur au centre, filleuls dessous, centrés", () => {
    const input: TreeInput = { me: person("Tristren"), up: person("Papi"), kids: [kid("Léa"), kid("Hugo")] };
    const t = layoutTree(input, false);
    expect(t.width).toBe(340);
    expect(t.up).toMatchObject({ x: 170, y: 26, initial: "P" });
    expect(t.me).toMatchObject({ x: 170, y: 112, initial: "T" });
    expect(t.kids.map((k) => k.y)).toEqual([210, 210]);
    // Symétriques autour du joueur
    expect(t.kids[0].x + t.kids[1].x).toBe(340);
    // Un fil vers le parrain, un par filleul ; pas de dernier rang
    expect(t.threads.filter((th) => !th.dim)).toHaveLength(3);
    expect(t.height).toBe(254);
  });

  it("sans parrain, tout remonte", () => {
    const t = layoutTree({ me: person("Tristren"), up: null, kids: [kid("Léa")] }, false);
    expect(t.up).toBeNull();
    expect(t.me.y).toBe(26);
    expect(t.kids[0]).toMatchObject({ x: 170, y: 124 });
  });

  it("au-delà de la place, garde ceux qui ont des filleuls et regroupe les autres", () => {
    const kids = [kid("a"), kid("b"), kid("c", 2), kid("d"), kid("e"), kid("f"), kid("g", 1), kid("h")];
    const t = layoutTree({ me: person("me"), up: null, kids }, false);
    // Téléphone : 6 places, dont « +N autres »
    expect(t.kids.map((k) => k.key)).toEqual(["a", "b", "c", "d", "g"]);
    expect(t.more).toMatchObject({ count: 3 });
    // Ordinateur : 10 places, tous montrés
    expect(layoutTree({ me: person("me"), up: null, kids }, true).kids).toHaveLength(8);
  });

  it("petits-filleuls : deux ou trois au plus, puis « +N »", () => {
    const t = layoutTree({ me: person("me"), up: null, kids: [kid("seul", 5)] }, false);
    expect(t.grandkids.map((g) => g.key)).toEqual(["seul-0", "seul-1"]);
    expect(t.grandMore).toEqual([expect.objectContaining({ count: 3 })]);
    expect(t.threads.filter((th) => th.dim)).toHaveLength(3);
  });

  it("raccourcit les noms trop longs", () => {
    expect(cut("Kurisu Makise", 6)).toBe("Kuris…");
    expect(cut("Léa", 6)).toBe("Léa");
  });
});
