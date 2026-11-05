import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_BATTLE_RULES } from "@/lib/battle/config";
import { baseKit } from "@/lib/battle/loadout";
import { KEYWORDS, TECHNIQUES, type Keyword, type Technique } from "@/lib/battle/types";
import { DEFAULT_RANKED_RULES } from "@/lib/ranked/defaults";
import { loadKits } from "./kits";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  abilityPurchase: { findMany: vi.fn() },
  cardLoadout: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: db }));
vi.mock("../env", () => ({ ablyEnabled: false, env: {}, appUrl: () => "https://kiraku.example" }));

const { botFighters, fightersOf } = await import("./battle-core");
const { getCandidates } = await import("./queries");

const rules = DEFAULT_BATTLE_RULES;
const card = (id: string, publicId: number, rarity = "LEGENDARY") => ({
  id,
  anilistId: 999,
  publicId,
  appearance: {},
  name: `Carte ${id}`,
  nameNative: null,
  imageUrl: "/x.webp",
  rank: 1,
  rarity,
  power: 60,
  ki: 60,
  series: { id: `s-${id}`, titleRomaji: "Série", universeId: null, universe: null },
});

const A = card("a", 4242);
const B = card("b", 4243);
const BASE_A = baseKit({ anilistId: A.publicId, rarity: "LEGENDARY" }, rules);
const BASE_B = baseKit({ anilistId: B.publicId, rarity: "LEGENDARY" }, rules);
// Rafale si la carte A ne l'a pas déjà, sinon le premier passif qu'elle n'a pas
const BOUGHT = (BASE_A.keywords.includes("FLURRY") ? KEYWORDS.find((k) => !BASE_A.keywords.includes(k)) : "FLURRY") as Keyword;
const TECH = TECHNIQUES.find((t) => t !== BASE_A.technique) as Technique;
// Le joueur « me » a acheté un passif et une technique pour la carte A, et les a équipés
const PURCHASES = [
  { cardId: "a", kind: "KEYWORD", ability: BOUGHT },
  { cardId: "a", kind: "TECHNIQUE", ability: TECH },
];
const LOADOUT = { cardId: "a", keywords: [BOUGHT, BASE_A.keywords[1]], technique: TECH };

beforeEach(() => {
  vi.clearAllMocks();
  db.abilityPurchase.findMany.mockImplementation(async ({ where }: { where: { userId: string } }) => (where.userId === "me" ? PURCHASES : []));
  db.cardLoadout.findMany.mockImplementation(async ({ where }: { where: { userId: string } }) => (where.userId === "me" ? [LOADOUT] : []));
});

describe("loadKits", () => {
  it("lit achats et kits en deux requêtes, pour ce joueur et ces cartes seulement", async () => {
    const kits = await loadKits(db as unknown as Prisma.TransactionClient, "me", [
      { cardId: "a", anilistId: A.publicId, rarity: "LEGENDARY" },
      { cardId: "b", anilistId: B.publicId, rarity: "LEGENDARY" },
    ], rules);
    expect(db.abilityPurchase.findMany).toHaveBeenCalledTimes(1);
    expect(db.cardLoadout.findMany).toHaveBeenCalledTimes(1);
    expect(db.abilityPurchase.findMany.mock.calls[0][0].where).toEqual({ userId: "me", cardId: { in: ["a", "b"] } });
    expect(kits.get("a")).toEqual({ keywords: LOADOUT.keywords, technique: TECH });
    expect(kits.get("b")).toEqual(BASE_B);
  });

  it("ne lit rien sans carte", async () => {
    expect((await loadKits(db as unknown as Prisma.TransactionClient, "me", [], rules)).size).toBe(0);
    expect(db.abilityPurchase.findMany).not.toHaveBeenCalled();
  });
});

describe("kits au lancement d'une partie", () => {
  const tx = (rows: { id: string; ownerId: string; card: ReturnType<typeof card> }[]) =>
    ({ ...db, userCard: { findMany: vi.fn().mockResolvedValue(rows) } }) as unknown as Prisma.TransactionClient;

  it("fightersOf : la carte achetée combat avec le kit choisi par son propriétaire", async () => {
    const fighters = await fightersOf(tx([{ id: "uc-a", ownerId: "me", card: A }, { id: "uc-b", ownerId: "me", card: B }]), ["uc-a", "uc-b"], rules);
    expect(fighters[0]).toMatchObject({ cardId: "a", keywords: LOADOUT.keywords, technique: TECH });
    // Une deuxième carte n'a pas les achats de la première
    expect(fighters[1]).toMatchObject({ cardId: "b", keywords: BASE_B.keywords, technique: BASE_B.technique });
  });

  it("fightersOf : le même personnage chez un autre joueur garde son tirage", async () => {
    const fighters = await fightersOf(tx([{ id: "uc-x", ownerId: "other", card: A }]), ["uc-x"], rules);
    expect(fighters[0]).toMatchObject({ keywords: BASE_A.keywords, technique: BASE_A.technique });
  });

  it("botFighters : les bots gardent le tirage de leurs cartes, sans lire aucun kit", async () => {
    const botTx = {
      ...db,
      rarityDefinition: { findMany: vi.fn().mockResolvedValue([{ key: "LEGENDARY" }]) },
      card: { count: vi.fn().mockResolvedValue(1), findFirst: vi.fn().mockResolvedValue(A) },
    } as unknown as Prisma.TransactionClient;
    const ctx = { now: new Date(), rules: { ...rules, botUpgradePct: 0 }, random: () => 0, dayStart: new Date(), ranked: DEFAULT_RANKED_RULES, timeZone: "UTC" };
    const [bot] = await botFighters(botTx, ["LEGENDARY"], ctx);
    expect(bot).toMatchObject({ cardId: "a", keywords: BASE_A.keywords, technique: BASE_A.technique });
    expect(db.abilityPurchase.findMany).not.toHaveBeenCalled();
    expect(db.cardLoadout.findMany).not.toHaveBeenCalled();
  });
});

describe("getCandidates", () => {
  it("le choix d'équipe affiche le kit acheté", async () => {
    db.$queryRaw.mockResolvedValue([
      { cardId: "a", anilistId: A.publicId, appearance: {}, name: "A", nameNative: null, imageUrl: "/x.webp", rank: 1, rarity: "LEGENDARY", power: 60, ki: 60, universeKey: "s-a", universeName: "Série" },
      { cardId: "b", anilistId: B.publicId, appearance: {}, name: "B", nameNative: null, imageUrl: "/x.webp", rank: 2, rarity: "LEGENDARY", power: 60, ki: 60, universeKey: "s-b", universeName: "Série" },
    ]);
    const [a, b] = await getCandidates("me", rules);
    expect(a).toMatchObject({ cardId: "a", keywords: LOADOUT.keywords, technique: TECH, universe: { key: "s-a", name: "Série" } });
    expect(b).toMatchObject({ cardId: "b", keywords: BASE_B.keywords, technique: BASE_B.technique });
  });
});
