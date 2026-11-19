import { describe, expect, it } from "vitest";
import { SETTING_DEFAULTS } from "../settings/defaults";
import { copyRecycleValue, planRecycle, recycleValue, type OwnedCopy } from "./recycle";

const values = SETTING_DEFAULTS["collection.recycleValues"];

let seq = 0;
function copies(cardId: string, rarity: OwnedCopy["rarity"], n: number, status: OwnedCopy["status"] = "COLLECTION") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${cardId}-${status}-${i}-${seq++}`,
    cardId,
    rarity,
    status,
    obtainedAt: new Date(Date.UTC(2026, 0, 1 + i)),
    heritage: 0,
    printing: null as number | null,
  }));
}

describe("recyclage des doublons", () => {
  it("garde toujours un exemplaire, le plus ancien", () => {
    const owned = copies("a", "COMMON", 4);
    const plan = planRecycle(owned, { values });
    expect(plan.ids).toHaveLength(3);
    expect(plan.ids).not.toContain(owned[0].id);
    expect(plan.gain).toBe(3);
  });

  it("ne touche pas à une carte possédée une seule fois", () => {
    expect(planRecycle(copies("a", "MYTHIC", 1), { values }).ids).toEqual([]);
  });

  it("garde l'exemplaire en vitrine au lieu du plus ancien", () => {
    const owned = copies("a", "RARE", 3);
    const shown = owned[2];
    const plan = planRecycle(owned, { values, protectedIds: new Set([shown.id]) });
    expect(plan.ids).toHaveLength(2);
    expect(plan.ids).not.toContain(shown.id);
    expect(plan.gain).toBe(2 * values.RARE);
  });

  it("exclut les exemplaires en vente ou en combat, sans les compter comme gardés", () => {
    const owned = [...copies("a", "EPIC", 1, "AUCTION"), ...copies("a", "EPIC", 1, "BATTLE"), ...copies("a", "EPIC", 2)];
    const plan = planRecycle(owned, { values });
    // Deux en collection : un gardé, un recyclé ; ceux en vente et en combat restent
    expect(plan.ids).toHaveLength(1);
    expect(owned.filter((c) => c.status !== "COLLECTION").some((c) => plan.ids.includes(c.id))).toBe(false);
  });

  it("ne recycle jamais un exemplaire misé au casino, ni ne le compte comme gardé", () => {
    const owned = [...copies("a", "EPIC", 1, "CASINO"), ...copies("a", "EPIC", 1)];
    expect(planRecycle(owned, { values }).ids).toEqual([]);
    const two = [...copies("b", "EPIC", 1, "CASINO"), ...copies("b", "EPIC", 2)];
    const plan = planRecycle(two, { values });
    expect(plan.ids).toHaveLength(1);
    expect(plan.ids).not.toContain(two[0].id);
  });

  it("ne recycle jamais un exemplaire spécial, et garde un ordinaire à côté de lui", () => {
    const engraved = { ...copies("a", "MYTHIC", 1)[0], printing: 1, serial: 7 };
    const heir = { ...copies("a", "MYTHIC", 1)[0], heritage: 2 };
    // Deux spéciaux et un seul ordinaire : rien ne part, l'ordinaire est celui qu'on garde
    expect(planRecycle([engraved, heir, ...copies("a", "MYTHIC", 1)], { values }).ids).toEqual([]);
    // Trois ordinaires en plus : deux partent, jamais les spéciaux, même plus récents
    const ordinary = copies("b", "MYTHIC", 3);
    const special = { ...copies("b", "MYTHIC", 1)[0], heritage: 5, obtainedAt: new Date(Date.UTC(2026, 5, 1)) };
    const plan = planRecycle([special, ...ordinary], { values });
    expect(plan.ids).toHaveLength(2);
    expect(plan.ids).not.toContain(special.id);
    expect(plan.ids).not.toContain(ordinary[0].id);
  });

  it("un exemplaire spécial recyclé seul : la gravée vaut le multiple de sa rareté, l'héritière sa rareté", () => {
    expect(copyRecycleValue({ rarity: "MYTHIC", printing: 1 }, values, 5)).toBe(values.MYTHIC * 5);
    expect(copyRecycleValue({ rarity: "MYTHIC", printing: null }, values, 5)).toBe(values.MYTHIC);
  });

  it("respecte la rareté maximale", () => {
    const owned = [...copies("a", "COMMON", 3), ...copies("b", "EPIC", 3), ...copies("c", "LEGENDARY", 3)];
    const plan = planRecycle(owned, { values, maxRarity: "EPIC" });
    expect(plan.byCard.get("a")).toBe(2);
    expect(plan.byCard.get("b")).toBe(2);
    expect(plan.byCard.has("c")).toBe(false);
    expect(plan.byRarity.LEGENDARY.copies).toBe(0);
    expect(plan.gain).toBe(2 * values.COMMON + 2 * values.EPIC);
  });

  it("limite le nombre recyclé par carte, en partant des plus récents", () => {
    const owned = copies("a", "UNCOMMON", 5);
    const plan = planRecycle(owned, { values, maxPerCard: 2 });
    expect(plan.ids).toEqual([owned[4].id, owned[3].id]);
  });

  it("calcule le gain par rareté", () => {
    expect(recycleValue("MYTHIC", 2, values)).toBe(300);
    const plan = planRecycle([...copies("a", "MYTHIC", 2), ...copies("b", "LEGENDARY", 3)], { values });
    expect(plan.byRarity.MYTHIC).toEqual({ copies: 1, zeni: 150 });
    expect(plan.byRarity.LEGENDARY).toEqual({ copies: 2, zeni: 80 });
    expect(plan.gain).toBe(230);
  });
});
