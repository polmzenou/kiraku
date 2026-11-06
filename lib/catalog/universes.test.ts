import { describe, expect, it } from "vitest";
import { cleanUniverseName, groupSeries, planUniverses, universeName, UNIVERSE_NAME_MAX, type RelationEdge, type UniverseSeries } from "./universes";

const series = (anilistId: number | null, titleRomaji = `Série ${anilistId}`, universeId: string | null = null): UniverseSeries => ({
  id: `s${anilistId ?? titleRomaji}`,
  anilistId,
  titleRomaji,
  universeId,
});
const edge = (from: number, to: number, type = "SEQUEL"): RelationEdge => ({ from, to, type });
const ids = (groups: { anilistId: number | null }[][]) => groups.map((g) => g.map((s) => s.anilistId).sort()).sort();

describe("composantes d'univers", () => {
  it("relie les séries en chaîne, dans n'importe quel sens", () => {
    const all = [series(1), series(2), series(3), series(9)];
    expect(ids(groupSeries(all, [edge(1, 2), edge(3, 2, "PREQUEL")]))).toEqual([[1, 2, 3], [9]]);
  });

  it("passe par une œuvre absente du catalogue : deux animés du même manga non importé", () => {
    const all = [series(1), series(2)];
    expect(ids(groupSeries(all, [edge(1, 500, "ADAPTATION"), edge(2, 500, "ADAPTATION")]))).toEqual([[1, 2]]);
  });

  it.each(["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY", "ADAPTATION", "SOURCE", "SUMMARY", "COMPILATION", "CONTAINS"])("retient %s", (type) => {
    expect(ids(groupSeries([series(1), series(2)], [edge(1, 2, type)]))).toEqual([[1, 2]]);
  });

  it.each(["CHARACTER", "OTHER", "SPIN_OFF", "ALTERNATIVE"])("exclut %s", (type) => {
    expect(ids(groupSeries([series(1), series(2)], [edge(1, 2, type)]))).toEqual([[1], [2]]);
  });

  it("une relation exclue ne relie pas non plus par une œuvre absente", () => {
    const all = [series(1), series(2)];
    expect(ids(groupSeries(all, [edge(1, 500, "SEQUEL"), edge(2, 500, "SPIN_OFF")]))).toEqual([[1], [2]]);
  });

  it("une série sans id AniList reste hors des groupes", () => {
    expect(ids(groupSeries([series(1), series(null, "Maison")], []))).toEqual([[1]]);
  });

  it("tient une longue chaîne sans déborder la pile", () => {
    const all = Array.from({ length: 5_000 }, (_, i) => series(i + 1));
    const edges = all.slice(1).map((_, i) => edge(i + 1, i + 2));
    expect(groupSeries(all, edges)).toHaveLength(1);
  });
});

describe("nom d'un univers", () => {
  it("prend le titre romaji le plus court", () => {
    expect(universeName([{ titleRomaji: "Jujutsu Kaisen 2nd Season" }, { titleRomaji: "Jujutsu Kaisen" }, { titleRomaji: "Jujutsu Kaisen 0" }])).toBe("Jujutsu Kaisen");
  });

  it("tranche les égalités sans dépendre de l'ordre", () => {
    expect(universeName([{ titleRomaji: "Bbb" }, { titleRomaji: "Aaa" }])).toBe("Aaa");
    expect(universeName([{ titleRomaji: "Aaa" }, { titleRomaji: "Bbb" }])).toBe("Aaa");
  });

  it("respecte la taille de la colonne", () => {
    expect([...universeName([{ titleRomaji: "x".repeat(120) }])]).toHaveLength(UNIVERSE_NAME_MAX);
  });

  it("nettoie un nom saisi dans l'admin", () => {
    expect(cleanUniverseName("  Jujutsu\n  Kaisen​ ")).toBe("Jujutsu Kaisen");
    expect(cleanUniverseName("   ")).toBeNull();
    expect(cleanUniverseName("x".repeat(UNIVERSE_NAME_MAX + 1))).toBeNull();
    expect(cleanUniverseName("x".repeat(UNIVERSE_NAME_MAX))).toHaveLength(UNIVERSE_NAME_MAX);
  });
});

describe("plan du script", () => {
  const seriesIds = (group: { series: UniverseSeries[] }) => group.series.map((s) => s.anilistId).sort();

  it("crée un univers pour un groupe sans univers, jamais pour une série seule", () => {
    const plan = planUniverses([series(1, "Jujutsu Kaisen 2"), series(2, "Jujutsu Kaisen"), series(3, "One Piece")], [edge(1, 2)]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].name).toBe("Jujutsu Kaisen");
    expect(seriesIds(plan.create[0])).toEqual([1, 2]);
    expect(plan.join).toEqual([]);
  });

  it("rattache une nouvelle série à l'univers existant, sans toucher aux séries déjà rangées", () => {
    const plan = planUniverses([series(1, "A", "u1"), series(2, "B", "u1"), series(3, "C")], [edge(1, 2), edge(2, 3)]);
    expect(plan.create).toEqual([]);
    expect(plan.join).toHaveLength(1);
    expect(plan.join[0].universeId).toBe("u1");
    expect(seriesIds(plan.join[0])).toEqual([3]);
  });

  it("ne propose rien quand tout est déjà rangé : les corrections de l'admin survivent aux relances", () => {
    const plan = planUniverses([series(1, "A", "u1"), series(2, "B", "u2")], [edge(1, 2)]);
    expect(plan).toEqual({ create: [], join: [], conflicts: [], withoutAnilist: [] });
  });

  it("une série retirée, seule dans son univers, n'est pas replacée", () => {
    const plan = planUniverses([series(1, "A", "u1"), series(2, "B", "u1"), series(3, "Retirée", "u-seule")], [edge(1, 2), edge(2, 3)]);
    expect(plan.join).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it("signale une série reliée à deux univers existants, sans la déplacer", () => {
    const plan = planUniverses([series(1, "A", "u1"), series(2, "B", "u2"), series(3, "C")], [edge(1, 3), edge(2, 3)]);
    expect(plan.join).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].universeIds.sort()).toEqual(["u1", "u2"]);
    expect(seriesIds(plan.conflicts[0])).toEqual([3]);
  });

  it("liste les séries sans id AniList à ranger à la main, sauf celles déjà rangées", () => {
    const plan = planUniverses([series(null, "Maison"), series(null, "Rangée", "u1")], []);
    expect(plan.withoutAnilist.map((s) => s.titleRomaji)).toEqual(["Maison"]);
  });
});
