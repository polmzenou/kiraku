import { describe, expect, it } from "vitest";
import { snowflakeDate } from "@/lib/discord/snowflake";
import { DEFAULT_REFERRAL_V2_RULES as RULES } from "./rules";
import type { StepTimes } from "./steps";
import { refereeTrust, trustPartDue } from "./trust";

const at = (iso: string) => new Date(iso);
const DAY = 86_400_000;
const LINKED = at("2026-11-24T10:00:00Z");

describe("confiance du filleul", () => {
  it("un Discord vieux de 30 jours à sa liaison donne la confiance haute", () => {
    expect(refereeTrust({ createdAt: snowflakeDate("175928847299117063"), linkedAt: LINKED }, RULES)).toBe("HIGH");
    expect(refereeTrust({ createdAt: new Date(LINKED.getTime() - 30 * DAY), linkedAt: LINKED }, RULES)).toBe("HIGH");
  });

  it("e-mail seul ou Discord récent : confiance moyenne, même quand ce Discord vieillit", () => {
    expect(refereeTrust({ createdAt: null, linkedAt: null }, RULES)).toBe("MEDIUM");
    expect(refereeTrust({ createdAt: new Date(LINKED.getTime() - 29 * DAY), linkedAt: LINKED }, RULES)).toBe("MEDIUM");
  });
});

describe("part « confiance » du parrain (boosters Mythiques des étapes 1 et 2)", () => {
  const s = (...reached: boolean[]): StepTimes => [0, 1, 2, 3].map((i) => (reached[i] ? at(`2026-12-0${i + 1}T12:00:00Z`) : null)) as unknown as StepTimes;

  it("confiance haute : versée dès son étape", () => {
    expect(trustPartDue(1, s(true), "HIGH")).toBe(true);
    expect(trustPartDue(2, s(true), "HIGH")).toBe(false);
    expect(trustPartDue(2, s(true, true), "HIGH")).toBe(true);
  });

  it("confiance moyenne : versée à l'étape 3, perdue sans elle", () => {
    expect(trustPartDue(1, s(true, true), "MEDIUM")).toBe(false);
    expect(trustPartDue(1, s(true, true, true), "MEDIUM")).toBe(true);
    expect(trustPartDue(2, s(true, true, true), "MEDIUM")).toBe(true);
    expect(trustPartDue(1, s(true, true, false, true), "MEDIUM")).toBe(false);
  });
});
