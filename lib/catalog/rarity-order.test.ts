import { describe, expect, it } from "vitest";
import { raritiesFrom } from "@/lib/economy/missions";
import { BASE_DEFINITIONS, orderedKeys, rarityKeyOrder } from "./definitions";

// Lignes telles que la base les rend (ordre quelconque), clés et rangs seulement
const rows = [...BASE_DEFINITIONS].reverse().map(({ key, sortOrder }) => ({ key, sortOrder }));

describe("rarityKeyOrder", () => {
  it("rend l'ordre du registre, celui des écrans", () => {
    expect(rarityKeyOrder(rows)).toEqual(orderedKeys(BASE_DEFINITIONS));
  });

  it("à rang égal, la rareté de base passe d'abord : une BR compte comme « Mythique ou mieux »", () => {
    const order = rarityKeyOrder(rows);
    expect(order.indexOf("MYTHIC")).toBeLessThan(order.indexOf("BR"));
    expect(raritiesFrom("MYTHIC", order)).toContain("BR");
    expect(raritiesFrom("BR", order)).not.toContain("MYTHIC");
  });
});
