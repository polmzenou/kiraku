import { describe, expect, it } from "vitest";
import { GUEST_LOCK, oneTabAtATime } from "./guest-lock";

/** Verrou exclusif factice : les rappels d'un même nom passent l'un après l'autre, comme navigator.locks. */
function fakeLocks() {
  const names: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const locks = {
    request: (name: string, callback: () => Promise<unknown>) => {
      names.push(name);
      const run = tail.then(() => callback());
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return { locks: locks as unknown as LockManager, names };
}

describe("oneTabAtATime", () => {
  it("fait passer les créations d'invité l'une après l'autre", async () => {
    const { locks, names } = fakeLocks();
    const log: string[] = [];
    let release!: () => void;
    const first = oneTabAtATime(async () => {
      log.push("A:début");
      await new Promise<void>((r) => (release = r));
      log.push("A:fin");
      return "A";
    }, locks);
    const second = oneTabAtATime(async () => {
      log.push("B");
      return "B";
    }, locks);
    await Promise.resolve();
    expect(log).toEqual(["A:début"]);
    release();
    expect(await Promise.all([first, second])).toEqual(["A", "B"]);
    expect(log).toEqual(["A:début", "A:fin", "B"]);
    expect(names).toEqual([GUEST_LOCK, GUEST_LOCK]);
  });

  it("libère le verrou même si la création échoue", async () => {
    const { locks } = fakeLocks();
    await expect(oneTabAtATime(() => Promise.reject(new Error("réseau")), locks)).rejects.toThrow("réseau");
    expect(await oneTabAtATime(async () => "ensuite", locks)).toBe("ensuite");
  });

  it("sans Web Locks, lance la création tout de suite", async () => {
    expect(await oneTabAtATime(async () => "seul", null)).toBe("seul");
  });
});
