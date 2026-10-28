import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ably = vi.hoisted(() => ({ publish: vi.fn(), createTokenRequest: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ ablyEnabled: true, env: { ABLY_API_KEY: "app.key:secret" } }));
vi.mock("ably", () => ({
  default: {
    Rest: class {
      channels = { get: () => ({ publish: ably.publish }) };
      auth = { createTokenRequest: ably.createTokenRequest };
    },
  },
}));

import type { BattleUpdate } from "./battle-core";
import { publishBattle, publishMatched, tokenRequest } from "./realtime";

const update = { battleId: "b1", turnEndsAt: null } as unknown as BattleUpdate;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("temps réel du combat sans Ably joignable", () => {
  it("une publication qui lève (quota dépassé, panne) ne fait jamais échouer l'action", async () => {
    ably.publish.mockRejectedValue(Object.assign(new Error("quota"), { code: 42910 }));
    await expect(publishBattle(update)).resolves.toBeUndefined();
    await expect(publishMatched("u1", "b1")).resolves.toBeUndefined();
  });

  it("une publication qui ne répond pas est abandonnée au bout du délai", async () => {
    vi.useFakeTimers();
    ably.publish.mockReturnValue(new Promise(() => {}));
    const done = publishBattle(update);
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(done).resolves.toBeUndefined();
  });

  it("un jeton impossible à signer donne null (le navigateur reste sur le sondage)", async () => {
    ably.createTokenRequest.mockRejectedValue(new Error("clé refusée"));
    expect(await tokenRequest("u1", "b1")).toBeNull();
  });

  it("le jeton ne donne que l'abonnement à ses propres canaux", async () => {
    ably.createTokenRequest.mockImplementation(async (p: unknown) => p);
    const req = (await tokenRequest("u1", "b1")) as unknown as { capability: string };
    expect(JSON.parse(req.capability)).toEqual({ "kiraku:user:u1": ["subscribe"], "kiraku:battle:b1": ["subscribe"] });
  });
});
