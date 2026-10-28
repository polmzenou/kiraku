import { describe, expect, it } from "vitest";
import { hostShares, parseMemAvailable, type HostMeasures } from "./host";

const GB = 1_073_741_824;

describe("mémoire disponible", () => {
  it("lit MemAvailable en octets", () => {
    const meminfo = "MemTotal:        3906244 kB\nMemFree:          212340 kB\nMemAvailable:    2048000 kB\nBuffers:           50000 kB\n";
    expect(parseMemAvailable(meminfo)).toBe(2_048_000 * 1024);
  });

  it("renvoie null sans le champ (noyau ancien, autre système)", () => {
    expect(parseMemAvailable("MemTotal: 1000 kB\nMemFree: 10 kB\n")).toBeNull();
    expect(parseMemAvailable("")).toBeNull();
  });
});

describe("parts de capacité du serveur", () => {
  const measures: HostMeasures = {
    load: { one: 7.5, five: 3, fifteen: 1, cores: 4 },
    memory: { totalBytes: 4 * GB, availableBytes: 1 * GB },
    disk: { totalBytes: 80 * GB, freeBytes: 60 * GB },
    connections: { open: 12, max: 100 },
  };

  it("rapporte charge (5 min), RAM, disque et connexions à leur capacité", () => {
    expect(hostShares(measures)).toEqual([
      { key: "cpu", share: 0.75 },
      { key: "memory", share: 0.75 },
      { key: "disk", share: 0.25 },
      { key: "connections", share: 0.12 },
    ]);
  });

  it("une mesure manquante vaut null, sans casser les autres", () => {
    const shares = hostShares({ ...measures, load: null, disk: null });
    expect(shares.find((s) => s.key === "cpu")?.share).toBeNull();
    expect(shares.find((s) => s.key === "disk")?.share).toBeNull();
    expect(shares.find((s) => s.key === "memory")?.share).toBe(0.75);
  });
});
