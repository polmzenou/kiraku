import { describe, expect, it, vi } from "vitest";
import { buildCsp, generateNonce } from "./csp";

function directives(csp: string) {
  return new Map(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  );
}

describe("buildCsp", () => {
  it("injecte le nonce et strict-dynamic dans script-src", () => {
    const d = directives(buildCsp("abc123", false));
    expect(d.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it("n'autorise unsafe-eval qu'en dev", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
    expect(buildCsp("n", false)).not.toContain("'unsafe-eval'");
  });

  it("protège les balises style par nonce et réserve unsafe-inline aux attributs Motion", () => {
    const d = directives(buildCsp("n", false));
    expect(d.get("style-src-elem")).toEqual(["'self'", "'nonce-n'"]);
    expect(d.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
    expect(d.get("style-src")).not.toContain("'unsafe-inline'");
  });

  it("bloque l'intégration en iframe et les objets", () => {
    const d = directives(buildCsp("n", false));
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
  });

  it("autorise les images AniList et Discord seulement", () => {
    const d = directives(buildCsp("n", false));
    expect(d.get("img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://s4.anilist.co",
      "https://cdn.discordapp.com",
    ]);
  });

  it("n'ouvre les connexions qu'au site et à Ably (temps réel du combat)", () => {
    const d = directives(buildCsp("n", false));
    expect(d.get("connect-src")).toEqual([
      "'self'",
      "wss://*.ably.net",
      "https://*.ably.net",
      "wss://*.ably.io",
      "https://*.ably.io",
      "https://*.ably-realtime.com",
      "wss://*.ably-realtime.com",
    ]);
  });

  it("n'ouvre la CSP aux domaines AdSense que si ADS_ENABLED=1", () => {
    vi.stubEnv("ADS_ENABLED", "");
    expect(buildCsp("n", false)).not.toContain("googlesyndication");
    vi.stubEnv("ADS_ENABLED", "1");
    const d = directives(buildCsp("n", false));
    expect(d.get("frame-src")).toContain("https://googleads.g.doubleclick.net");
    expect(d.get("img-src")).toContain("https://*.googlesyndication.com");
    expect(d.get("connect-src")).toContain("https://fundingchoicesmessages.google.com");
    // Le script passe par le nonce et strict-dynamic, pas par une liste d'hôtes
    expect(d.get("script-src")).toEqual(["'self'", "'nonce-n'", "'strict-dynamic'"]);
    vi.unstubAllEnvs();
  });

  it("force HTTPS en prod uniquement", () => {
    expect(buildCsp("n", false)).toContain("upgrade-insecure-requests");
    expect(buildCsp("n", true)).not.toContain("upgrade-insecure-requests");
  });
});

describe("generateNonce", () => {
  it("produit des valeurs base64 uniques", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(generateNonce()).not.toBe(a);
  });
});
