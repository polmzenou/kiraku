import { describe, expect, it } from "vitest";
import { cleanDeckName, DECK_NAME_MAX, sameTeam } from "./decks";

describe("cleanDeckName", () => {
  it("garde un nom ordinaire", () => {
    expect(cleanDeckName("Deck CSM")).toBe("Deck CSM");
    expect(cleanDeckName("呪術廻戦 ⚡ été")).toBe("呪術廻戦 ⚡ été");
  });

  it("réduit tout espace blanc à un seul espace et ôte ceux des bords", () => {
    expect(cleanDeckName("  Deck   CSM  ")).toBe("Deck CSM");
    expect(cleanDeckName("Deck\n\nCSM\tNo 1")).toBe("Deck CSM No 1");
    expect(cleanDeckName("Deck\r\nCSM")).toBe("Deck CSM");
  });

  it("retire les caractères de contrôle et d'orientation", () => {
    expect(cleanDeckName("De\u0000ck‮ CSM​")).toBe("Deck CSM");
    // L'espace invisible retiré ne laisse pas deux espaces
    expect(cleanDeckName("Deck ​ CSM")).toBe("Deck CSM");
  });

  it.each(["", "   ", "\n\t", "​‮"])("refuse un nom vide : %j", (raw) => {
    expect(cleanDeckName(raw)).toBeNull();
  });

  it("borne la longueur après nettoyage", () => {
    expect(cleanDeckName("x".repeat(DECK_NAME_MAX))).toBe("x".repeat(DECK_NAME_MAX));
    expect(cleanDeckName("x".repeat(DECK_NAME_MAX + 1))).toBeNull();
    expect(cleanDeckName(`  ${"x".repeat(DECK_NAME_MAX)}  `)).toBe("x".repeat(DECK_NAME_MAX));
  });
});

describe("sameTeam", () => {
  it("reconnaît les mêmes personnages dans n'importe quel ordre", () => {
    expect(sameTeam(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
    expect(sameTeam(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("distingue une équipe différente ou incomplète", () => {
    expect(sameTeam(["a", "b", "c"], ["a", "b", "d"])).toBe(false);
    expect(sameTeam(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(sameTeam(["a", "a", "b"], ["a", "b", "c"])).toBe(false);
    expect(sameTeam(["a", "b", "c"], ["a", "a", "b"])).toBe(false);
  });
});
