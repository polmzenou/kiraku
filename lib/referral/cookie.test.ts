import { describe, expect, it } from "vitest";
import { inviteCodeFromUrl, referralCookieName, referralCookieOptions } from "./cookie";

const LOCALES = ["fr", "en"];
const code = (path: string, query = "") => inviteCodeFromUrl(path, new URLSearchParams(query), LOCALES);

describe("cookie du lien d'invitation", () => {
  it("lit le code de /i/CODE, avec ou sans langue, standard ou perso", () => {
    expect(code("/i/H8V95ZAU")).toBe("H8V95ZAU");
    expect(code("/en/i/h8v95zau")).toBe("H8V95ZAU");
    expect(code("/i/TRISTREN")).toBe("TRISTREN");
    expect(code("/fr/i/tri-stren")).toBe("TRISTREN");
  });

  it("lit ?ref=CODE sur une page partagée", () => {
    expect(code("/tirage/abc", "ref=H8V95ZAU")).toBe("H8V95ZAU");
    expect(code("/u/Lea", "ref=tristren")).toBe("TRISTREN");
  });

  it("ignore un code mal formé, une autre page, un chemin plus long ou un encodage cassé", () => {
    expect(code("/i/!!")).toBeNull();
    expect(code("/i/%E0%A4%A")).toBeNull();
    expect(code("/i/AB")).toBeNull();
    expect(code("/i/H8V95ZAU/x")).toBeNull();
    expect(code("/parrainage")).toBeNull();
    expect(code("/tirage/abc", "ref=<script>")).toBeNull();
  });

  it("nom et options du cookie : httpOnly, 30 jours, sécurisé en production", () => {
    expect(referralCookieName(true)).toBe("__Secure-kiraku.ref");
    expect(referralCookieName(false)).toBe("kiraku.ref");
    expect(referralCookieOptions(true)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 2_592_000 });
  });
});
