import { describe, expect, it } from "vitest";
import { bigFlipMessage, casinoOpeningMessage, casinoTeaserMessage } from "./casino-message";

const ORIGIN = "https://kiraku-kun.com";

describe("annonces Discord du casino", () => {
  it("teaser : compte à rebours natif de Discord et façade fermée", () => {
    const opensAt = new Date("2026-12-01T19:00:00Z");
    const m = casinoTeaserMessage({ opensAt, origin: ORIGIN });
    const ts = Math.floor(opensAt.getTime() / 1000);
    expect(m.content).toContain(`<t:${ts}:R>`);
    expect(m.content).toContain(`<t:${ts}:F>`);
    expect(m.embeds?.[0].image?.url).toBe(`${ORIGIN}/casino/discord/teaser-v1.jpg`);
    expect(m.components?.[0].components[0].url).toBe(`${ORIGIN}/casino`);
    expect(m.allowed_mentions).toEqual({ parse: [] });
  });

  it("teaser sans date : « bientôt »", () => {
    expect(casinoTeaserMessage({ opensAt: null, origin: ORIGIN }).content).toContain("ouvre bientôt");
  });

  it("ouverture : objectif commun et récompense quand ils sont réglés", () => {
    const m = casinoOpeningMessage({ origin: ORIGIN, goal: 5000, reward: "Booster Impérial" });
    expect(m.content).toContain("5 000 lancers");
    expect(m.content).toContain("Booster Impérial pour tout le monde");
    expect(m.embeds?.[0].image?.url).toBe(`${ORIGIN}/casino/discord/opening-v1.jpg`);
    expect(casinoOpeningMessage({ origin: ORIGIN, goal: null, reward: null }).content).not.toContain("Objectif");
  });

  it("gros lancer : gagnant, sceau, face sortie et lien vers la table", () => {
    const m = bigFlipMessage(
      { id: "t1", winnerName: "Sora_ame", seal: "神", result: "OMOTE", card: { name: "Satoru Gojou", imageUrl: "https://img/x.png", rarityName: "Mythique", spoiler: false } },
      ORIGIN,
    );
    expect(m.content).toContain("**Sora\\_ame** remporte une fuda 神");
    expect(m.embeds?.[0]).toMatchObject({ title: "Satoru Gojou · Mythique", description: "La pièce est tombée sur 表.", url: `${ORIGIN}/casino/pile-ou-face/t1`, image: { url: "https://img/x.png" } });
  });

  it("une carte spoiler est annoncée sans son illustration, un pseudo ne casse pas la mise en forme", () => {
    const m = bigFlipMessage(
      { id: "t2", winnerName: "**x**", seal: "金", result: "URA", card: { name: "Secret", imageUrl: "https://img/s.png", rarityName: "Légendaire", spoiler: true } },
      ORIGIN,
    );
    expect(m.embeds?.[0].image).toBeUndefined();
    expect(m.content).toContain("\\*\\*x\\*\\*");
  });
});
