import { describe, expect, it } from "vitest";
import { awardState, awardsState } from "./awards";

describe("état des prix du tirage", () => {
  it("à verser tant que la ligne est vide, versé avec paidAt, écarté avec skipped", () => {
    expect(awardState({})).toBe("PENDING");
    expect(awardState(null)).toBe("PENDING");
    expect(awardState({ zeni: 10, credits: {}, sealedIds: [], cardIds: [], voucherIds: [], paidAt: "2026-12-20T18:00:00.000Z" })).toBe("PAID");
    expect(awardState({ skipped: "BANNED", at: "2026-12-20T18:00:00.000Z" })).toBe("SKIPPED");
  });

  it("plusieurs prix : à verser d'abord, écarté seulement si tous le sont", () => {
    expect(awardsState([])).toBeNull();
    expect(awardsState(["PAID", "PENDING"])).toBe("PENDING");
    expect(awardsState(["PAID", "PAID"])).toBe("PAID");
    expect(awardsState(["SKIPPED", "PAID"])).toBe("PAID");
    expect(awardsState(["SKIPPED", "SKIPPED"])).toBe("SKIPPED");
  });
});
