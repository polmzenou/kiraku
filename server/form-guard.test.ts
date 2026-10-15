import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ env: { AUTH_SECRET: "x".repeat(40) } }));

const { checkFormGuard, FORM_MIN_MS, HONEYPOT_FIELD, issueFormToken } = await import("./form-guard");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

describe("garde anti-robots des formulaires", () => {
  const t0 = 1_760_000_000_000;

  it("accepte un formulaire rempli à vitesse humaine", () => {
    const token = issueFormToken("register", t0);
    expect(checkFormGuard(form({ formToken: token }), "register", t0 + FORM_MIN_MS + 1)).toBe("ok");
  });

  it("refuse un envoi trop rapide ou trop vieux", () => {
    const token = issueFormToken("register", t0);
    expect(checkFormGuard(form({ formToken: token }), "register", t0 + 500)).toBe("tooFast");
    expect(checkFormGuard(form({ formToken: token }), "register", t0 + 3 * 3_600_000)).toBe("expired");
  });

  it("refuse un jeton absent, forgé, ou d'un autre formulaire", () => {
    const token = issueFormToken("register", t0);
    const later = t0 + 10_000;
    expect(checkFormGuard(form({}), "register", later)).toBe("invalid");
    expect(checkFormGuard(form({ formToken: `${t0}.forged` }), "register", later)).toBe("invalid");
    expect(checkFormGuard(form({ formToken: token.replace(String(t0), String(t0 - 60_000)) }), "register", later)).toBe("invalid");
    expect(checkFormGuard(form({ formToken: token }), "login", later)).toBe("invalid");
  });

  it("refuse quand le champ piège est rempli", () => {
    const token = issueFormToken("register", t0);
    expect(checkFormGuard(form({ formToken: token, [HONEYPOT_FIELD]: "http://spam" }), "register", t0 + 10_000)).toBe("invalid");
  });
});
