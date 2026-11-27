import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ ablyEnabled: false, env: {} }));

import { publishOn } from "./realtime";

function fakeRest(publish: () => Promise<void>) {
  const order: string[] = [];
  const rest = {
    channels: {
      get: vi.fn((name: string) => {
        order.push(`get:${name}`);
        return { publish: vi.fn(async () => { await publish(); order.push("publish"); }) };
      }),
      release: vi.fn((name: string) => order.push(`release:${name}`)),
    },
  };
  return { rest: rest as unknown as Parameters<typeof publishOn>[0], order };
}

describe("publication sur un canal Ably", () => {
  it("retire le canal du registre du client une fois publié", async () => {
    const { rest, order } = fakeRest(async () => {});
    await publishOn(rest, "kiraku:battle:b1", "update", { turn: 1 });
    expect(order).toEqual(["get:kiraku:battle:b1", "publish", "release:kiraku:battle:b1"]);
  });

  it("le retire aussi quand la publication échoue", async () => {
    const { rest, order } = fakeRest(async () => { throw new Error("quota"); });
    await expect(publishOn(rest, "kiraku:user:u1", "notification", {})).rejects.toThrow("quota");
    expect(order).toEqual(["get:kiraku:user:u1", "release:kiraku:user:u1"]);
  });
});
