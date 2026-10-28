import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ appUrl: () => "https://kiraku-kun.com" }));

const { isSameOrigin } = await import("./same-origin");

// Derrière Nginx, Next voit l'adresse locale du processus, pas le domaine public
const post = (origin?: string) =>
  new Request("http://localhost:3000/api/admin/catalogue/preview", { method: "POST", headers: origin ? { origin } : {} });

describe("contrôle d'origine des POST", () => {
  it("accepte l'origine publique même quand la requête arrive sur localhost", () => {
    expect(isSameOrigin(post("https://kiraku-kun.com"))).toBe(true);
  });

  it("accepte l'origine locale pour le dev", () => {
    expect(isSameOrigin(post("http://localhost:3000"))).toBe(true);
  });

  it("refuse une autre origine ou une origine absente", () => {
    expect(isSameOrigin(post("https://evil.test"))).toBe(false);
    expect(isSameOrigin(post("http://kiraku-kun.com"))).toBe(false);
    expect(isSameOrigin(post())).toBe(false);
  });
});
