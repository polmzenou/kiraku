import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./settings", () => ({ getSetting: vi.fn() }));
vi.mock("./economy/ledger", () => ({ credit: vi.fn() }));

import type { Prisma } from "@/generated/prisma/client";
import { availableUsername } from "./players";

/** Transaction factice : chaque appel est noté dans l'ordre (verrou, lecture insensible, lecture exacte). */
function fakeTx(taken: (username: string) => boolean) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push(`lock:${String(values[1])}`);
      expect(strings.join("?")).toContain("pg_advisory_xact_lock(?::int, hashtext(lower(?)))");
      return 1;
    }),
    user: {
      findFirst: vi.fn(async ({ where }: { where: { username: { equals: string } } }) => {
        calls.push(`anyCase:${where.username.equals}`);
        return taken(where.username.equals) ? { id: "x" } : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { username: string } }) => {
        calls.push(`exact:${where.username}`);
        return taken(where.username) ? { id: "x" } : null;
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

describe("availableUsername", () => {
  it("verrouille le pseudo venu de Discord avant de le chercher sans la casse", async () => {
    const { tx, calls } = fakeTx(() => false);
    expect(await availableUsername(tx, "Sakura")).toBe("Sakura");
    expect(calls).toEqual(["lock:Sakura", "anyCase:Sakura"]);
  });

  it("verrouille aussi chaque pseudo suffixé essayé", async () => {
    const { tx, calls } = fakeTx((name) => name === "Sakura");
    const name = await availableUsername(tx, "Sakura");
    expect(name).toMatch(/^Sakura-[0-9A-F]{6}$/);
    expect(calls).toEqual(["lock:Sakura", "anyCase:Sakura", `lock:${name}`, `anyCase:${name}`]);
  });

  it("un pseudo d'invité tiré au hasard garde la comparaison exacte, sans verrou", async () => {
    const { tx, calls } = fakeTx(() => false);
    const name = await availableUsername(tx, null);
    expect(calls).toEqual([`exact:${name}`]);
  });
});
