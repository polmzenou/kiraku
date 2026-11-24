import { describe, expect, it } from "vitest";
import { holdReason, referralPairScore, scoreIsFresh, type PairPerson } from "./hold";
import { DEFAULT_REFERRAL_V2_RULES as RULES } from "./rules";

const referrer: PairPerson = { id: "tristren", username: "Tristren", email: "t@exemple.fr", createdAt: new Date("2026-09-19T18:00:00Z") };
const referee: PairPerson = { id: "lea", username: "Léa", email: "lea@exemple.fr", createdAt: new Date("2026-11-24T10:00:00Z") };
const base = { referrer, referee, signals: [], transfers: [], sharedCap: 4 };

describe("score de la paire parrain-filleul", () => {
  it("le lien de parrainage et l'ami unique ne comptent pas", () => {
    expect(referralPairScore(base)).toEqual({ score: 0, reasons: [] });
  });

  it("un appareil commun pèse 60, une IP commune 30", () => {
    const device = referralPairScore({
      ...base,
      signals: [
        { userId: "tristren", kind: "DEVICE", value: "d1" },
        { userId: "lea", kind: "DEVICE", value: "d1" },
      ],
    });
    expect(device.score).toBe(60);
    const ip = referralPairScore({
      ...base,
      signals: [
        { userId: "tristren", kind: "IP", value: "ip1" },
        { userId: "lea", kind: "IP", value: "ip1" },
      ],
    });
    expect(ip.score).toBe(30);
  });

  it("ignore les signaux et transferts d'autres joueurs", () => {
    const other = referralPairScore({
      ...base,
      signals: [
        { userId: "tristren", kind: "DEVICE", value: "d1" },
        { userId: "autre", kind: "DEVICE", value: "d1" },
      ],
      transfers: [{ fromId: "lea", toId: "autre", kind: "gift", count: 9 }],
    });
    expect(other.score).toBe(0);
  });
});

describe("mise « À vérifier »", () => {
  it("l'appareil commun bloque d'abord, puis un score à partir du seuil", () => {
    expect(holdReason({ sharedDevice: true, score: 0 }, RULES)).toBe("DEVICE");
    expect(holdReason({ sharedDevice: false, score: 60 }, RULES)).toBe("SCORE");
    expect(holdReason({ sharedDevice: false, score: 59 }, RULES)).toBeNull();
    expect(holdReason({ sharedDevice: false, score: null }, RULES)).toBeNull();
  });

  it("un score sert pendant 24 h", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(scoreIsFresh(new Date("2026-11-24T10:00:01Z"), now, RULES)).toBe(true);
    expect(scoreIsFresh(new Date("2026-11-24T10:00:00Z"), now, RULES)).toBe(false);
    expect(scoreIsFresh(null, now, RULES)).toBe(false);
  });
});
