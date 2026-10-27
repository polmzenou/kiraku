import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/economy/referral", () => ({
  REFERRAL_COOKIE: { name: "kiraku-ref", maxAge: 2_592_000, options: { httpOnly: true, sameSite: "lax", path: "/" } },
}));

// Préfixe « as-needed » de next-intl : rien pour le français, /en pour l'anglais
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) => (locale === "fr" ? href : `/${locale}${href}`),
}));

const { GET } = await import("./route");

const call = (locale: string, code: string) =>
  GET(new NextRequest(`https://kiraku.test/i/${code}`), { params: Promise.resolve({ locale, code }) });

describe("lien d'invitation /i/CODE", () => {
  it("garde le code et le passe à la page de parrainage pour l'aperçu", async () => {
    const res = await call("fr", "swun-wzly");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://kiraku.test/parrainage?parrain=SWUNWZLY");
    expect(res.cookies.get("kiraku-ref")?.value).toBe("SWUNWZLY");
  });

  it("garde la langue et ignore un code invalide", async () => {
    const res = await call("en", "nope");
    expect(res.headers.get("location")).toBe("https://kiraku.test/en/parrainage");
    expect(res.cookies.get("kiraku-ref")).toBeUndefined();
  });
});
