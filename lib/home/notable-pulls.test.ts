import { describe, expect, it } from "vitest";
import { isNotablePull, notablePullRarities } from "./notable-pulls";

const ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "AR", "GOLD"];

describe("gros tirages enregistrés", () => {
  it("à partir d'Épique, variantes comprises", () => {
    expect(notablePullRarities(ORDER)).toEqual(["EPIC", "LEGENDARY", "MYTHIC", "AR", "GOLD"]);
    expect(isNotablePull("EPIC", ORDER)).toBe(true);
    expect(isNotablePull("GOLD", ORDER)).toBe(true);
    expect(isNotablePull("RARE", ORDER)).toBe(false);
  });

  it("une rareté hors du registre n'est jamais enregistrée ; sans Épique au registre, toutes le sont", () => {
    expect(isNotablePull("INCONNUE", ORDER)).toBe(false);
    expect(notablePullRarities(["COMMON", "MYTHIC"])).toEqual(["COMMON", "MYTHIC"]);
  });
});
