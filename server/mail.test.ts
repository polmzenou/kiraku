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
  it("réussit quand Resend accepte", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect(await sendMail(mail)).toEqual({ ok: true });
  });

  it.each([429, 403, 500])("échoue sans lever quand Resend répond %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    expect(await sendMail(mail)).toEqual({ ok: false, reason: "refused", detail: `HTTP ${status}` });
  });

  it("garde et journalise la raison donnée par Resend, tronquée", async () => {
    const body = { name: "validation_error", message: "You can only send testing emails to your own email address." };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 403 })));
    const result = await sendMail(mail);
    expect(result).toEqual({ ok: false, reason: "refused", detail: `${body.name} : ${body.message}` });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("validation_error"));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "x".repeat(1000) }, { status: 422 })));
    const long = await sendMail(mail);
    expect(!long.ok && long.detail?.length).toBe(300);
  });

  it("échoue sans lever quand Resend est injoignable ou trop lent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await sendMail(mail)).toEqual({ ok: false, reason: "unreachable", detail: "fetch failed" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await sendMail(mail)).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("passe un délai maximal à la requête", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendMail(mail);
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
