import { describe, expect, it } from "vitest";
import { localizedSchema } from "@/lib/boosters/types";
import { loreSchema } from "./admin-form";
import v1 from "./fixtures/snapshot-v1.json";
import { parseLotGrant, parseSnapshotPayout, readSnapshot, snapshotSchema } from "./snapshot";

// Photo d'expédition : une photo v1 écrite en base doit rester lisible quoi qu'il arrive aux formulaires de l'admin.
// fixtures/snapshot-v1.json est une photo telle qu'écrite au lancement avant le 26/11/2026 (sans copie du lot) :
// ne jamais la modifier, en ajouter une autre pour une nouvelle version.

const NO_REWARD = { zeni: 0, boosters: 0, extraLot: false };

describe("photo d'une expédition", () => {
  it("relit une photo v1 figée, gains compris", () => {
    expect(snapshotSchema.safeParse(v1).success).toBe(true);
    expect(readSnapshot(v1)).toEqual(v1);
    expect(parseSnapshotPayout(v1)).toEqual({ v: 1, boosterTypeId: v1.boosterTypeId, extraLotId: v1.extraLotId, rewards: v1.rewards });
  });

  it("ne dépend pas des formulaires : un texte plus long ou une rareté renommée restent lisibles", () => {
    // Ce que le formulaire d'un modèle refuserait aujourd'hui (nom > 80, ambiance > 200, clé de rareté en minuscules)
    const loose = { ...v1, name: { fr: "N".repeat(120), en: "" }, lore: { fr: "L".repeat(500), en: "" }, minRarity: "ancienne-rarete", extra: true };
    expect(localizedSchema.safeParse(loose.name).success).toBe(false);
    expect(loreSchema.safeParse(loose.lore).success).toBe(false);
    expect(snapshotSchema.safeParse(loose).success).toBe(true);
    expect(readSnapshot(loose)).toMatchObject({ name: loose.name, lore: loose.lore, minRarity: "ancienne-rarete" });
    expect(parseSnapshotPayout(loose)?.rewards).toEqual(v1.rewards);
  });

  it("un champ d'affichage illisible ne touche ni aux gains ni au rapport", () => {
    const broken = { ...v1, name: 42, lore: null, minRarity: "", risk: "EXTREME", bonuses: "?" };
    expect(parseSnapshotPayout(broken)?.rewards.SUCCESS).toEqual({ zeni: 800, boosters: 4, extraLot: true });
    const shown = readSnapshot(broken);
    // Nom de repli : le slug
    expect(shown).toMatchObject({ name: { fr: v1.slug, en: "" }, lore: { fr: "", en: "" }, minRarity: "COMMON", risk: "BALANCED", bonuses: [] });
    expect(shown.rewards).toEqual(v1.rewards);
  });

  it("gains illisibles : rien à verser, et un rapport à zéro plutôt qu'aucun rapport", () => {
    const broken = { ...v1, rewards: { SUCCESS: { zeni: -1 } } };
    expect(parseSnapshotPayout(broken)).toBeNull();
    expect(readSnapshot(broken).rewards).toEqual({ FAILURE: NO_REWARD, SUCCESS: NO_REWARD, TRIUMPH: NO_REWARD });
    expect(readSnapshot(broken).name.fr).toBe(v1.name.fr);
    expect(parseSnapshotPayout({ ...v1, v: 2 })).toBeNull();
    expect(readSnapshot(null)).toMatchObject({ name: { fr: "" }, rewards: { SUCCESS: NO_REWARD } });
    expect(readSnapshot([1, 2])).toMatchObject({ minRarity: "COMMON" });
  });

  it("garde la copie du lot bonus ; illisible, le lot se relit par son id", () => {
    const lot = { zeni: 50, items: [{ kind: "RARITY_CARD", rarity: "MYTHIC", quantity: 1 }, { kind: "BOOSTER", boosterTypeId: "b1", quantity: 2 }] };
    expect(parseSnapshotPayout({ ...v1, lot })?.lot).toEqual(lot);
    expect(parseSnapshotPayout({ ...v1, lot: null })?.lot).toBeNull();
    const garbled = parseSnapshotPayout({ ...v1, lot: { zeni: "x" } });
    expect(garbled?.lot).toBeUndefined();
    expect(garbled?.extraLotId).toBe(v1.extraLotId);
  });

  it("relit le lot versé à la clôture", () => {
    expect(parseLotGrant({ zeni: 50, boosters: [{ boosterTypeId: "b1", count: 2 }] })).toEqual({ zeni: 50, boosters: [{ boosterTypeId: "b1", count: 2 }] });
    expect(parseLotGrant(null)).toBeNull();
    expect(parseLotGrant({ zeni: "x", boosters: 3 })).toEqual({ zeni: 0, boosters: [] });
  });
});
