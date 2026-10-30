import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { SeasonSnapshot } from "@/lib/discord/season";

vi.mock("server-only", () => ({}));
import { seasonImage } from "./season-image";

const snapshot: SeasonSnapshot = {
  version: 1, number: 4, nextNumber: 5, closedAt: "2026-11-01T00:00:00.000Z", total: 7,
  entries: [
    { position: 1, username: "rover", image: null, pc: 1882, tier: "GRAND_CHAMPION", division: null },
    { position: 2, username: "Tristren", image: null, pc: 1848, tier: "GRAND_CHAMPION", division: null },
    { position: 3, username: "Kata", image: null, pc: 1711, tier: "CHAMPION", division: 1 },
    ...["Cat", "ReadyStrike", "WonderOfU", "Kokoro"].map((username, i) => ({ position: i + 4, username, image: null, pc: [187, 80, 60, 45][i], tier: "BRONZE" as const, division: (i === 0 ? 2 : 3) as 2 | 3 })),
  ],
};

describe("image réelle du bilan de saison", () => {
  it("rend un PNG avec les polices et emblèmes Kiraku, sans accès réseau", async () => {
    const response = await seasonImage(snapshot, false);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(966);
    // Artefact visuel conservé pour la revue ; aucun joueur ou score réel n'est modifié.
    await mkdir("reports", { recursive: true });
    await writeFile("reports/discord-season-preview.png", bytes);
  }, 30_000);
  it("rend aussi un classement vide sans révéler un profil privé", async () => {
    const bytes = Buffer.from(await (await seasonImage({ ...snapshot, entries: [], total: 1 }, false)).arrayBuffer());
    expect(bytes.readUInt32BE(20)).toBe(510);
  }, 30_000);
});
