import { describe, expect, it } from "vitest";
import { engravedMessage, rebirthMessage } from "./prestige-message";

const ORIGIN = "https://kiraku.example";

describe("annonces du prestige sur Discord", () => {
  it("une renaissance : chiffre romain, rang global, lien vers le profil public", () => {
    const msg = rebirthMessage({ name: "Kaito", username: "Kaito", prestige: 3, globalRank: 7, heirs: 20 }, ORIGIN);
    expect(msg.content).toContain("**Kaito**");
    expect(msg.content).toContain("**III**");
    expect(msg.embeds?.[0]?.title).toBe("Prestige III · 7ᵉ renaissance de Kiraku");
    expect(msg.embeds?.[0]?.url).toBe(`${ORIGIN}/u/Kaito`);
    expect(msg.allowed_mentions).toEqual({ parse: [] });
  });

  it("un profil privé reste « Un joueur », sans lien de profil", () => {
    const msg = rebirthMessage({ name: "Un joueur", username: null, prestige: 1, globalRank: 1, heirs: 0 }, ORIGIN);
    expect(msg.content).toContain("**Un joueur**");
    expect(msg.embeds?.[0]?.title).toContain("1re renaissance");
    expect(msg.embeds?.[0]?.url).toBe(`${ORIGIN}/prestige`);
  });

  it("une gravée : sceau, numéro et taille, registre de la carte ; sans illustration si elle spoile", () => {
    const card = { name: "Gojo", imageUrl: "https://img.example/gojo.jpg", rarityName: "Mythique", spoiler: false, anilistId: 127691 };
    const msg = engravedMessage({ name: "Kaito", seal: "初摺", serial: 1, size: 25, card }, ORIGIN);
    expect(msg.content).toContain("初摺 n° 1 / 25");
    expect(msg.embeds?.[0]?.description).toContain("le numéro 1 du tirage");
    expect(msg.embeds?.[0]?.url).toBe(`${ORIGIN}/wiki/127691`);
    expect(msg.embeds?.[0]?.image).toEqual({ url: card.imageUrl });
    const hidden = engravedMessage({ name: "Kaito", seal: null, serial: 9, size: 25, card: { ...card, spoiler: true } }, ORIGIN);
    expect(hidden.embeds?.[0]?.image).toBeUndefined();
    expect(hidden.content).toContain("n° 9 / 25");
  });

  it("neutralise les mentions et le formatage dans les pseudos", () => {
    const msg = rebirthMessage({ name: "@everyone **x**", username: null, prestige: 2, globalRank: 3, heirs: 1 }, ORIGIN);
    expect(msg.content).not.toContain("@everyone **x**");
  });
});
