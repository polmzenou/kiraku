import { describe, expect, it } from "vitest";
import { rankLabel, referralLaunchMessage, type AnnounceEnnichi } from "./referral-announce";

const steps = [
  { kanji: "一", say: "Il crée son compte", friend: "20 boosters Tout anime · 1 booster Jūbako", you: "5 boosters Tout anime · 1 booster Mythique" },
  { kanji: "二", say: "Il ouvre 20 boosters en 2 jours", friend: null, you: "2 boosters Jūbako" },
];
const ennichi: AnnounceEnnichi = {
  live: true,
  startsAt: new Date("2026-12-01T18:00:00Z"),
  days: 14,
  multiplier: 2,
  tiers: [{ lanterns: 25, gifts: "30 boosters Tout anime · 2 boosters Jūbako" }],
  ranks: [{ label: rankLabel(1, 1), gifts: "titre Yokozuna · carte 1/1 au choix" }],
  pool: "1 carte 1/1 au choix, 20 boosters divin",
};

describe("annonce du lancement à la communauté", () => {
  it("@everyone, un encadré par nouveauté, un bouton vers le parrainage", () => {
    const m = referralLaunchMessage({ steps, ennichi, origin: "https://kiraku.example" });
    expect(m.content).toBe("@everyone");
    expect(m.allowed_mentions).toEqual({ parse: ["everyone"] });
    expect(m.embeds?.map((e) => e.title)).toEqual(["Le parrainage change", "L'Ennichi commence"]);
    expect(m.embeds?.[0].fields?.[0]).toEqual({ name: "一 Il crée son compte", value: "Pour lui : 20 boosters Tout anime · 1 booster Jūbako\nPour toi : 5 boosters Tout anime · 1 booster Mythique" });
    expect(m.embeds?.[0].fields?.[1].value).toBe("Pour lui : rien\nPour toi : 2 boosters Jūbako");
    expect(m.embeds?.[1].fields?.map((f) => f.name)).toEqual(["倍 ×2 sur les étapes 1 et 2", "灯 Lanternes", "番 Banzuke", "籤 Omikuji"]);
    expect(m.components?.[0].components[0]).toMatchObject({ style: 5, label: "Inviter un ami", url: "https://kiraku.example/parrainage" });
    expect(m.embeds?.[0].image?.url).toBe("https://kiraku.example/images/referral/discord-annonce-v1.jpg");
  });

  it("fête annoncée : sa date en horodatage Discord ; sans fête, un seul encadré", () => {
    const before = referralLaunchMessage({ steps, ennichi: { ...ennichi, live: false, multiplier: 1 }, origin: "https://kiraku.example" });
    expect(before.embeds?.[1].title).toBe("L'Ennichi arrive");
    expect(before.embeds?.[1].description).toContain(`<t:${Date.parse("2026-12-01T18:00:00Z") / 1000}:F>`);
    expect(before.embeds?.[1].fields?.map((f) => f.name)).not.toContain("倍 ×1 sur les étapes 1 et 2");
    expect(referralLaunchMessage({ steps, ennichi: null, origin: "https://kiraku.example" }).embeds).toHaveLength(1);
  });

  it("rangs du banzuke en toutes lettres", () => {
    expect([rankLabel(1, 1), rankLabel(2, 3), rankLabel(4, 10), rankLabel(11, 50)]).toEqual(["1er", "2e et 3e", "4e à 10e", "11e à 50e"]);
  });
});
