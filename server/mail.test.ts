import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ env: { RESEND_API_KEY: "re_test", MAIL_FROM: "Kiraku <noreply@kiraku.test>" }, isProduction: true, mailEnabled: true }));

import { sendMail } from "./mail";

const mail = { to: "joueur@example.com", subject: "Sujet", text: "Corps" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendMail", () => {
  it("renvoie true quand Resend accepte", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect(await sendMail(mail)).toBe(true);
  });

  it.each([429, 403, 500])("renvoie false sans lever quand Resend répond %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    expect(await sendMail(mail)).toBe(false);
  });

  it("renvoie false sans lever quand Resend est injoignable ou trop lent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await sendMail(mail)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await sendMail(mail)).toBe(false);
  });

  it("passe un délai maximal à la requête", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendMail(mail);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
