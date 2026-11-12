import { describe, expect, it } from "vitest";
import { boostersForCards, byRarityThenName, firstPublishedAt, groupReleases, newCardsBadge, type ReleasedCard } from "./releases";

const card = (publicId: number, publishedAt: string): ReleasedCard => ({ id: `c${publicId}`, publicId, publishedAt });

describe("firstPublishedAt", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  const before = new Date("2026-11-01T08:00:00Z");

  it("date la première publication", () => {
    expect(firstPublishedAt(null, "PUBLISHED", now)).toEqual(now);
    expect(firstPublishedAt(undefined, "PUBLISHED", now)).toEqual(now);
  });

  it("ne date pas un brouillon ni un archivage jamais publié", () => {
    expect(firstPublishedAt(null, "DRAFT", now)).toBeNull();
    expect(firstPublishedAt(null, "ARCHIVED", now)).toBeNull();
  });

  it("garde la date connue : ni réécrite à une nouvelle publication, ni effacée à l'archivage", () => {
    expect(firstPublishedAt(before, "PUBLISHED", now)).toBe(before);
    expect(firstPublishedAt(before, "ARCHIVED", now)).toBe(before);
    expect(firstPublishedAt(before, "DRAFT", now)).toBe(before);
  });
});

describe("groupReleases", () => {
  it("regroupe par jour du fuseau du jeu, plus récente d'abord, dans l'ordre de publication", () => {
    const releases = groupReleases(
      [
        card(3, "2026-11-12T09:00:00.000Z"),
        card(1, "2026-11-10T15:00:00.000Z"),
        card(2, "2026-11-12T08:00:00.000Z"),
        card(4, "2026-11-12T17:30:00.000Z"),
      ],
      "Europe/Paris",
      5,
    );
    expect(releases.map((r) => r.day)).toEqual(["2026-11-12", "2026-11-10"]);
    expect(releases[0].cards.map((c) => c.publicId)).toEqual([2, 3, 4]);
    expect(releases[0].lastPublishedAt).toBe("2026-11-12T17:30:00.000Z");
  });

  it("coupe à minuit à Paris, pas à minuit UTC", () => {
    // 23 h 30 UTC le 11 = 0 h 30 le 12 à Paris ; 22 h 30 UTC le 11 = 23 h 30 le 11 à Paris
    const releases = groupReleases([card(1, "2026-11-11T22:30:00.000Z"), card(2, "2026-11-11T23:30:00.000Z")], "Europe/Paris", 5);
    expect(releases.map((r) => [r.day, r.cards.map((c) => c.publicId)])).toEqual([
      ["2026-11-12", [2]],
      ["2026-11-11", [1]],
    ]);
    expect(groupReleases([card(1, "2026-11-11T22:30:00.000Z"), card(2, "2026-11-11T23:30:00.000Z")], "UTC", 5)).toHaveLength(1);
  });

  it("garde au plus `max` sorties, et rien sans carte", () => {
    const cards = [1, 2, 3, 4].map((d) => card(d, `2026-11-0${d}T12:00:00.000Z`));
    expect(groupReleases(cards, "Europe/Paris", 2).map((r) => r.day)).toEqual(["2026-11-04", "2026-11-03"]);
    expect(groupReleases([], "Europe/Paris", 5)).toEqual([]);
    expect(groupReleases(cards, "Europe/Paris", 0)).toEqual([]);
  });
});

describe("newCardsBadge", () => {
  const [latest] = groupReleases([card(7, "2026-11-12T08:00:00.000Z"), card(8, "2026-11-12T10:00:00.000Z")], "Europe/Paris", 1);

  it("marque la dernière sortie pendant `hours` après sa dernière publication", () => {
    expect(newCardsBadge(latest, new Date("2026-11-14T09:59:00Z"), 48)).toEqual({ publicIds: [7, 8], until: "2026-11-14T10:00:00.000Z" });
  });

  it("s'éteint à l'échéance, avec 0 heure ou sans sortie", () => {
    expect(newCardsBadge(latest, new Date("2026-11-14T10:00:00Z"), 48)).toBeNull();
    expect(newCardsBadge(latest, new Date("2026-11-12T10:00:00Z"), 0)).toBeNull();
    expect(newCardsBadge(undefined, new Date("2026-11-12T10:00:00Z"), 48)).toBeNull();
  });
});

describe("boostersForCards", () => {
  it("liste les boosters de chaque carte et compte les cartes par booster, sans les boosters vides", () => {
    const pools = [
      { slug: "event", ids: new Set(["b"]) },
      { slug: "standard", ids: new Set(["y"]) },
      { slug: "imperial", ids: new Set(["a", "b", "x"]) },
      { slug: "shonen", ids: new Set(["a"]) },
    ];
    // Le plus fourni d'abord, l'ordre reçu à égalité ; chaque carte suit le même ordre
    expect(boostersForCards(pools, ["a", "b", "c"])).toEqual({
      byCard: { a: ["imperial", "shonen"], b: ["imperial", "event"], c: [] },
      boosters: [
        { slug: "imperial", count: 2 },
        { slug: "event", count: 1 },
        { slug: "shonen", count: 1 },
      ],
    });
  });
});

describe("byRarityThenName", () => {
  it("met la plus rare d'abord (ordre du registre), puis trie par nom", () => {
    const cards = [
      { rarity: "COMMON", name: "Usopp" },
      { rarity: "AR", name: "Luffy" },
      { rarity: "AR", name: "Gojo" },
      { rarity: "MYTHIC", name: "Zoro" },
    ];
    const sorted = [...cards].sort(byRarityThenName(["COMMON", "MYTHIC", "AR"], "fr"));
    expect(sorted.map((c) => c.name)).toEqual(["Gojo", "Luffy", "Zoro", "Usopp"]);
  });
});
