import { describe, expect, it } from "vitest";
import { checkOwnCardLock, checkPairLock, lockEnd, type LockSubject } from "./locks";
import { DEFAULT_REFERRAL_V2_RULES as RULES } from "./rules";

const DAY = 86_400_000;
const REFERRED = new Date("2026-11-24T10:00:00Z");
const after = (ms: number) => new Date(REFERRED.getTime() + ms);

const referee: LockSubject = { id: "lea", referredById: "tristren", referredAt: REFERRED };
const referrer: LockSubject = { id: "tristren", referredById: null, referredAt: null };
const oldReferee: LockSubject = { id: "paul", referredById: "tristren", referredAt: null }; // parrainage v1

describe("verrou des cartes du filleul (14 jours)", () => {
  it("bloque jusqu'à la fin du 14e jour, plus après", () => {
    expect(checkOwnCardLock(referee, after(14 * DAY - 1), RULES)).toBe("REFEREE_LOCKED");
    expect(checkOwnCardLock(referee, after(14 * DAY), RULES)).toBeNull();
    expect(lockEnd(referee, RULES.cardLockDays)).toEqual(after(14 * DAY));
  });

  it("ne touche ni le parrain ni un ancien filleul v1", () => {
    expect(checkOwnCardLock(referrer, after(DAY), RULES)).toBeNull();
    expect(checkOwnCardLock(oldReferee, after(DAY), RULES)).toBeNull();
  });
});

describe("verrou de la paire (30 jours)", () => {
  it("rien ne passe du filleul à son parrain pendant 30 jours", () => {
    expect(checkPairLock(referee, "tristren", after(29 * DAY), RULES)).toBe("PAIR_LOCKED");
    expect(checkPairLock(referee, "tristren", after(30 * DAY), RULES)).toBeNull();
  });

  it("le parrain peut donner à son filleul, et le filleul à un autre joueur", () => {
    expect(checkPairLock(referrer, "lea", after(DAY), RULES)).toBeNull();
    expect(checkPairLock(referee, "quelquun", after(DAY), RULES)).toBeNull();
    expect(checkPairLock(oldReferee, "tristren", after(DAY), RULES)).toBeNull();
  });
});
