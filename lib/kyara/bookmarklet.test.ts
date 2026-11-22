import { inflateRawSync } from "node:zlib";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { bookmarkletHref, bookmarkletSource, BOOKMARKLET_BUILD, type BookmarkletTexts } from "./bookmarklet";
import { decodeKyaraFragment, type InflateRaw } from "./payload";

// Contrat du favori, exécuté dans un bac à sable avec un faux kyara.games (réponses synthétiques de même forme
// que les routes vues dans des projets tiers ; à recaler sur le test du lot 0).

const inflate: InflateRaw = (bytes, max) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: max }));
const TEXTS: BookmarkletTexts = { wrongPage: "mauvaise page", noToken: "pas connecté", reading: "{n} cartes", hidden: "cachée", failed: "échec {e}", copy: "copie" };
const ID = "2af84af1-f619-45a3-bc8b-7072d0a8fd10";
const KEY = "S".repeat(43);
const TOKEN = "jeton-secret-de-kyara";
const AVATAR = "https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png";

type Reply = { status?: number; body?: unknown };

function sandbox(opts: { origin?: string; path?: string; token?: string | null; routes?: Record<string, Reply>; mode?: "navigate" | "print" } = {}) {
  const calls: string[] = [];
  const alerts: string[] = [];
  const assigned: string[] = [];
  const routes: Record<string, Reply> = opts.routes ?? {
    [`/api/users/${ID}`]: { body: { pseudo: "Joueur", avatar: AVATAR } },
    [`/api/me/friends/${ID}/collection?page=1`]: { body: { items: [{ characterId: 40, qty: 2 }, { characterId: 41, qty: 1 }], total: 3, more: true } },
    [`/api/me/friends/${ID}/collection?page=2`]: { body: { items: [{ characterId: 5, qty: 1 }], total: 3, more: false } },
    "/api/characters": { body: [{ id: 40, rarity: "M" }, { id: 41, rarity: "L" }, { id: 5, rarity: "C" }] },
  };
  const context = createContext({
    location: {
      origin: opts.origin ?? "https://kyara.games",
      pathname: opts.path ?? `/profil/${ID}`,
      assign: (url: string) => assigned.push(url),
    },
    localStorage: { getItem: (k: string) => (k === "kyara_token" ? (opts.token === undefined ? TOKEN : opts.token) : null) },
    fetch: async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url);
      const reply = routes[url] ?? { status: 404 };
      // Les routes « /me » exigent le jeton ; les routes publiques ne le reçoivent pas
      const mine = url === "/api/me" || url.startsWith("/api/me/");
      if (mine && init?.headers?.authorization !== `Bearer ${opts.token === undefined ? TOKEN : opts.token}`) return { ok: false, status: 401 };
      if (!mine && init?.headers) throw new Error("jeton envoyé à une route publique");
      const status = reply.status ?? 200;
      return { ok: status < 400, status, json: async () => reply.body };
    },
    alert: (m: string) => alerts.push(m),
    prompt: () => null,
    console: { log: () => {} },
    document: { title: "" },
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    TextEncoder,
    Response,
    Blob,
    CompressionStream,
    btoa,
  });
  const run = () => runInContext(bookmarkletSource({ receiveUrl: "https://kiraku-kun.com/admin/kyara/recevoir", staffKey: KEY, texts: TEXTS, mode: opts.mode ?? "navigate" }), context) as Promise<void>;
  return { run, calls, alerts, assigned };
}

describe("favori de l'équipe", () => {
  it("lit les pages de la collection, complète les raretés et ouvre la réception avec un lot valide, sans le jeton", async () => {
    const s = sandbox();
    await s.run();
    expect(s.alerts).toEqual([]);
    expect(s.assigned).toHaveLength(1);
    const [base, fragment] = s.assigned[0].split("#");
    expect(base).toBe("https://kiraku-kun.com/admin/kyara/recevoir");
    expect(fragment).toMatch(/^v2z\./);
    expect(s.assigned[0]).not.toContain(TOKEN);
    const decoded = decodeKyaraFragment(fragment, inflate);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.payload).toMatchObject({ build: BOOKMARKLET_BUILD, kyaraUserId: ID, key: KEY, pseudo: "Joueur", avatarUrl: AVATAR, total: 3, copies: 4 });
    expect(decoded.payload.entries).toEqual([
      { anilistId: 5, qty: 1, code: "C" },
      { anilistId: 40, qty: 2, code: "M" },
      { anilistId: 41, qty: 1, code: "L" },
    ]);
    expect(s.calls).toEqual([
      `/api/users/${ID}`,
      "/api/me",
      `/api/me/friends/${ID}/collection?page=1`,
      `/api/me/friends/${ID}/collection?page=2`,
      "/api/characters",
    ]);
  });

  it("profil du compte connecté (essai avec un seul compte) : lit sa propre collection", async () => {
    const s = sandbox({
      routes: {
        [`/api/users/${ID}`]: { body: { pseudo: "Moi", avatar: AVATAR } },
        "/api/me": { body: { id: ID.toUpperCase() } },
        "/api/me/collection?lean=1&page=1": { body: [{ characterId: 40, qty: 1, rarity: "M" }] },
      },
    });
    await s.run();
    expect(s.alerts).toEqual([]);
    expect(s.calls).toEqual([`/api/users/${ID}`, "/api/me", "/api/me/collection?lean=1&page=1"]);
    const decoded = decodeKyaraFragment(s.assigned[0].split("#")[1], inflate);
    expect(decoded.ok && decoded.payload.entries).toEqual([{ anilistId: 40, qty: 1, code: "M" }]);
  });

  it("ne lit rien hors d'un profil kyara.games, ni sans session Kyara", async () => {
    for (const opts of [{ origin: "https://evil.example" }, { path: "/collection" }, { path: `/profil/${ID}/cartes` }]) {
      const s = sandbox(opts);
      await s.run();
      expect(s.alerts, JSON.stringify(opts)).toEqual(["mauvaise page"]);
      expect(s.calls).toEqual([]);
    }
    const noToken = sandbox({ token: null });
    await noToken.run();
    expect(noToken.alerts).toEqual(["pas connecté"]);
    expect(noToken.calls).toEqual([]);
  });

  it("collection masquée pour le compte Kiraku : message dédié, rien n'est envoyé", async () => {
    const s = sandbox({
      routes: { [`/api/users/${ID}`]: { body: { pseudo: "Joueur", avatar: null } }, [`/api/me/friends/${ID}/collection?page=1`]: { status: 403 } },
    });
    await s.run();
    expect(s.alerts).toEqual(["cachée"]);
    expect(s.assigned).toEqual([]);
  });

  it("tient dans un favori : code court, sans « # » brut dans l'adresse", () => {
    const source = bookmarkletSource({ receiveUrl: "https://kiraku-kun.com/admin/kyara/recevoir", staffKey: KEY, texts: TEXTS, mode: "navigate" });
    expect(source.length).toBeLessThan(4_000);
    const href = bookmarkletHref(source);
    expect(href.startsWith("javascript:")).toBe(true);
    expect(href.slice("javascript:".length)).not.toContain("#");
    expect(decodeURIComponent(href.slice("javascript:".length))).toBe(source);
  });
});
