import { describe, expect, it, vi } from "vitest";
import { LATE_SOUND_MS, whenRunning } from "./synth";

/** Contexte audio factice : son état, et un réveil (le même pour tous les sons en attente) qui aboutit quand le test le décide. */
function fakeContext(state: AudioContextState) {
  let wake: () => void = () => {};
  let refuse: () => void = () => {};
  const pending = new Promise<void>((resolve, reject) => {
    wake = () => {
      ac.state = "running";
      resolve();
    };
    refuse = () => reject(new Error("NotAllowedError"));
  });
  const ac = { state, resume: vi.fn(() => pending) };
  return { ac: ac as unknown as AudioContext & { state: AudioContextState }, wake: () => wake(), refuse: () => refuse() };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("sons et contexte audio", () => {
  it("contexte qui tourne : le son part tout de suite", () => {
    const { ac } = fakeContext("running");
    const schedule = vi.fn();
    whenRunning(ac, schedule);
    expect(schedule).toHaveBeenCalledOnce();
    expect(ac.resume).not.toHaveBeenCalled();
  });

  it("contexte qui démarre (premier geste) : le son part au réveil", async () => {
    const { ac, wake } = fakeContext("suspended");
    const schedule = vi.fn();
    let clock = 1_000;
    whenRunning(ac, schedule, () => clock);
    expect(schedule).not.toHaveBeenCalled();
    clock += 30;
    wake();
    await flush();
    expect(schedule).toHaveBeenCalledOnce();
  });

  it("réveil tardif (Safari, premier appui bien après) : les sons en attente sont perdus, pas joués en rafale", async () => {
    const { ac, wake } = fakeContext("suspended");
    const late = [vi.fn(), vi.fn(), vi.fn()];
    let clock = 1_000;
    for (const schedule of late) whenRunning(ac, schedule, () => clock);
    clock += LATE_SOUND_MS + 1;
    wake();
    await flush();
    for (const schedule of late) expect(schedule).not.toHaveBeenCalled();
  });

  it("réveil refusé ou contexte fermé : rien ne joue, rien ne lève", async () => {
    const refused = fakeContext("suspended");
    const schedule = vi.fn();
    whenRunning(refused.ac, schedule);
    refused.refuse();
    await flush();
    expect(schedule).not.toHaveBeenCalled();

    const closed = fakeContext("closed");
    whenRunning(closed.ac, schedule);
    expect(closed.ac.resume).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});
