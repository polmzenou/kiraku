import { describe, expect, it } from "vitest";
import { buildDataExport, EXPORT_FIELDS, exportFileName, type ExportInput } from "./export";

const now = new Date("2026-10-16T12:00:00Z");

function input(over: Partial<ExportInput> = {}): ExportInput {
  const empty = Object.fromEntries(Object.keys(EXPORT_FIELDS).map((k) => [k, []])) as unknown as ExportInput;
  return {
    ...empty,
    profile: { id: "u1", username: "Kaito", email: "k@exemple.fr", createdAt: now },
    review: null,
    ...over,
  };
}

describe("export des données", () => {
  it("ne laisse jamais sortir un secret, même sélectionné par erreur", () => {
    const out = buildDataExport(
      input({
        profile: { id: "u1", username: "Kaito", passwordHash: "$argon2id$...", createdAt: now },
        linkedAccounts: [{ provider: "discord", providerAccountId: "123", access_token: "SECRET-ACCESS", refresh_token: "SECRET-REFRESH", id_token: "SECRET-JWT" }],
        pushSubscriptions: [{ endpoint: "https://push.example/abc", p256dh: "SECRET-P256", auth: "SECRET-AUTH", createdAt: now }],
        battles: [{ id: "b1", mode: "RANKED", seed: 424242, setup: { secret: "SECRET-SETUP" }, state: {} }],
      }),
      now,
    );
    const text = JSON.stringify(out);
    for (const secret of ["argon2id", "SECRET-", "424242", '"seed"', '"state"', '"passwordHash"']) {
      expect(text).not.toContain(secret);
    }
    expect(out.linkedAccounts).toEqual([{ provider: "discord", providerAccountId: "123" }]);
  });

  it("garde les champs utiles et convertit les dates", () => {
    const out = buildDataExport(input({ ledger: [{ amount: -200, reason: "BOOSTER", refId: "o1", balanceAfter: 300, createdAt: now }] }), now);
    expect(out.profile).toEqual({ id: "u1", username: "Kaito", email: "k@exemple.fr", createdAt: now.toISOString() });
    expect(out.ledger).toEqual([{ amount: -200, reason: "BOOSTER", refId: "o1", balanceAfter: 300, createdAt: now.toISOString() }]);
    expect(out).toMatchObject({ format: "kiraku-data-export", version: 1, generatedAt: now.toISOString(), review: null });
  });

  it("nomme le fichier par la date", () => {
    expect(exportFileName(now)).toBe("kiraku-donnees-2026-10-16.json");
  });
});
