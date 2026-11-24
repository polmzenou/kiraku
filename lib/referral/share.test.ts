import { describe, expect, it } from "vitest";
import { shareCodeOf, withShareCode } from "./share";

describe("code du parrain sur les liens partagés", () => {
  it("prend le code perso, sinon le code standard, et rien pour un invité", () => {
    expect(shareCodeOf({ isGuest: false, referralCode: "H8V95ZAU", vanityCode: "TRISTREN" })).toBe("TRISTREN");
    expect(shareCodeOf({ isGuest: false, referralCode: "H8V95ZAU", vanityCode: null })).toBe("H8V95ZAU");
    expect(shareCodeOf({ isGuest: true, referralCode: "H8V95ZAU", vanityCode: null })).toBeNull();
    expect(shareCodeOf(null)).toBeNull();
  });

  it("ajoute ou remplace ?ref sans toucher au reste du lien", () => {
    expect(withShareCode("https://kiraku.example/tirage/abc", "H8V95ZAU")).toBe("https://kiraku.example/tirage/abc?ref=H8V95ZAU");
    expect(withShareCode("https://kiraku.example/u/Lea?x=1&ref=OLD#top", "TRISTREN")).toBe("https://kiraku.example/u/Lea?x=1&ref=TRISTREN#top");
    expect(withShareCode("https://kiraku.example/u/Lea", null)).toBe("https://kiraku.example/u/Lea");
    expect(withShareCode("pas une adresse", "TRISTREN")).toBe("pas une adresse");
  });
});
