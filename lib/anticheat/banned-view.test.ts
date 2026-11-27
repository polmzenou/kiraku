import { describe, expect, it } from "vitest";
import { clustersFor } from "./banned-view";
import type { SuspectCluster } from "./score";

const pair = (a: string, b: string, score: number) => ({ a, b, score, reasons: [] });
const clusters: SuspectCluster[] = [
  // Groupe sans banni
  { score: 80, userIds: ["a", "b"], pairs: [pair("a", "b", 80)] },
  // Groupe entièrement banni
  { score: 90, userIds: ["x", "y"], pairs: [pair("x", "y", 90)] },
  // Groupe mixte : deux comptes actifs et un banni
  { score: 95, userIds: ["c", "d", "z"], pairs: [pair("c", "z", 95), pair("c", "d", 60)] },
  // Un compte actif relié à un banni : contournement possible
  { score: 70, userIds: ["e", "w"], pairs: [pair("e", "w", 70)] },
];
const banned = new Set(["x", "y", "z", "w"]);
const isBanned = (id: string) => banned.has(id);

describe("vue multi-comptes et comptes bannis", () => {
  it("par défaut, retire les bannis et les groupes entièrement bannis", () => {
    const view = clustersFor(clusters, isBanned, "active");
    expect(view.map((c) => c.userIds)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(view.map((c) => c.bannedIds)).toEqual([[], ["z"], ["w"]]);
  });

  it("garde seulement les paires entre comptes non bannis, et le score qui en découle", () => {
    const [, mixed, alone] = clustersFor(clusters, isBanned, "active");
    expect(mixed.pairs).toEqual([pair("c", "d", 60)]);
    expect(mixed.score).toBe(60);
    // Seul face à un banni : pas de paire à montrer, le score du groupe reste
    expect(alone.pairs).toEqual([]);
    expect(alone.score).toBe(70);
  });

  it("le filtre « Comptes bannis » montre les groupes qui en ont, en entier", () => {
    const view = clustersFor(clusters, isBanned, "banned");
    expect(view.map((c) => c.userIds)).toEqual([["x", "y"], ["c", "d", "z"], ["e", "w"]]);
    expect(view[1].pairs).toHaveLength(2);
  });
});
