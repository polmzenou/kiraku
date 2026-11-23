import { describe, expect, it } from "vitest";
import { kyaraProfileInputSchema, kyaraProfileUrl, parseKyaraProfileUrl } from "./profile-url";

const ID = "2af84af1-f619-45a3-bc8b-7072d0a8fd10";

describe("adresse d'un profil Kyara", () => {
  it("garde l'uuid d'une adresse de profil, avec ou sans https, barre finale, requête ou ancre", () => {
    expect(parseKyaraProfileUrl(`https://kyara.games/profil/${ID}`)).toBe(ID);
    expect(parseKyaraProfileUrl(`  https://kyara.games/profil/${ID}/  `)).toBe(ID);
    expect(parseKyaraProfileUrl(`kyara.games/profil/${ID}`)).toBe(ID);
    expect(parseKyaraProfileUrl(`https://KYARA.games/profil/${ID.toUpperCase()}?tab=cartes#haut`)).toBe(ID);
    expect(parseKyaraProfileUrl(ID.toUpperCase())).toBe(ID);
    expect(kyaraProfileUrl(ID)).toBe(`https://kyara.games/profil/${ID}`);
  });

  it("refuse tout ce qui n'est pas exactement un profil sur kyara.games", () => {
    for (const bad of [
      "",
      `http://kyara.games/profil/${ID}`,
      `https://kyara.games.evil.com/profil/${ID}`,
      `https://evil.com/kyara.games/profil/${ID}`,
      `https://kyara.games@evil.com/profil/${ID}`,
      `https://user:pass@kyara.games/profil/${ID}`,
      `https://www.kyara.games/profil/${ID}`,
      `https://kyara.games:8443/profil/${ID}`,
      `https://kyara.games/profile/${ID}`,
      `https://kyara.games/profil/${ID}/collection`,
      "https://kyara.games/profil/pas-un-uuid",
      `javascript:alert(1)//kyara.games/profil/${ID}`,
      `https://kyara.games/profil/${ID}${"x".repeat(200)}`,
    ]) {
      expect(parseKyaraProfileUrl(bad), bad).toBeNull();
    }
  });

  it("le champ du formulaire renvoie l'uuid ou une erreur", () => {
    expect(kyaraProfileInputSchema.parse(`https://kyara.games/profil/${ID}`)).toBe(ID);
    expect(kyaraProfileInputSchema.safeParse("https://kyara.games/").success).toBe(false);
  });
});
