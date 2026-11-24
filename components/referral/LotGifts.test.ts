import { describe, expect, it } from "vitest";
import { boosterWord } from "./LotGifts";

describe("boosterWord", () => {
  it("retire le mot « booster » déjà écrit par le texte", () => {
    expect(boosterWord("Booster divin")).toBe("divin");
    expect(boosterWord("Divine booster")).toBe("Divine");
    expect(boosterWord("booster  Mythique")).toBe("Mythique");
  });

  it("garde les autres noms tels quels", () => {
    expect(boosterWord("Tout anime")).toBe("Tout anime");
    expect(boosterWord("Jūbako")).toBe("Jūbako");
    expect(boosterWord("Boosterland")).toBe("Boosterland");
  });

  it("garde le nom s'il n'est fait que du mot « booster »", () => {
    expect(boosterWord("Booster")).toBe("Booster");
  });
});
