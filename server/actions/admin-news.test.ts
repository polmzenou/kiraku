import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEWS_DEFAULT, type NewsConfig } from "@/lib/home/news-schema";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rateLimit: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), log: vi.fn(), visuals: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../settings", () => ({ forgetSettings: vi.fn(), SETTINGS_TAG: "settings" }));
vi.mock("../admin/log", () => ({ writeAdminLog: mocks.log }));
vi.mock("../catalog/rarities", () => ({ getRarities: vi.fn() }));
vi.mock("../home/news", () => ({ resolveNewsVisuals: mocks.visuals }));
vi.mock("../db", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ gameSetting: { findMany: mocks.findMany, upsert: mocks.upsert } }) },
}));
import { previewNewsVisuals, updateNewsSettings } from "./admin-settings";

const stored: NewsConfig = { ...NEWS_DEFAULT, revision: 4, publishedAt: "2026-10-30T12:00:00.000Z" };
const NOW = new Date("2026-11-02T09:30:00.000Z");
const HOST = "store.public.blob.vercel-storage.com";
const draft = (over: Partial<NewsConfig> = {}) => ({ "home.news": { ...stored, title: { fr: "Kiraku-kun v2.6", en: "" }, ...over } });
const written = () => mocks.upsert.mock.calls[0]?.[0].update.value as NewsConfig;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.findMany.mockResolvedValue([{ key: "home.news", value: stored }]);
  mocks.visuals.mockResolvedValue({ x: { kind: "none" } });
  vi.stubEnv("BLOB_PUBLIC_HOST", HOST);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("publication de l'encart Nouveautés", () => {
  it("refuse les non-admins et un contenu invalide, sans rien écrire", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await updateNewsSettings(draft(), true)).toEqual({ ok: false, error: "FORBIDDEN" });
    mocks.admin.mockResolvedValue({ id: "admin" });
    const bad = draft({ items: [{ ...stored.items[0], link: { kind: "external", href: "javascript:alert(1)", label: { fr: "x", en: "" } } }] });
    expect(await updateNewsSettings(bad, true)).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rouvre l'encart : révision suivante et date du serveur, jamais celles du client", async () => {
    const res = await updateNewsSettings(draft({ revision: 99, publishedAt: "2020-01-01T00:00:00.000Z" }), true);
    expect(res).toEqual({ ok: true, changed: ["home.news"] });
    expect(written()).toMatchObject({ revision: 5, publishedAt: NOW.toISOString(), title: { fr: "Kiraku-kun v2.6", en: "" } });
    expect(mocks.log).toHaveBeenCalledTimes(1);
  });

  it("corrige sans rouvrir : révision et date en vigueur gardées (tout sauf true compte pour non)", async () => {
    for (const reopen of [false, "true", 1, undefined]) {
      mocks.upsert.mockClear();
      await updateNewsSettings(draft({ revision: 99, publishedAt: null }), reopen);
      expect(written()).toMatchObject({ revision: 4, publishedAt: stored.publishedAt, title: { fr: "Kiraku-kun v2.6", en: "" } });
    }
  });

  it("n'écrit rien quand rien ne change et qu'on ne rouvre pas", async () => {
    expect(await updateNewsSettings({ "home.news": stored }, false)).toEqual({ ok: true, changed: [] });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("n'enregistre que des images du stockage du site, sous /news/", async () => {
    const image = (url: string) => draft({ items: [{ ...stored.items[0], visual: { kind: "image", url, focalX: 50, focalY: 50 } }] });
    expect(await updateNewsSettings(image("https://evil.test/news/a.webp"), true)).toEqual({ ok: false, error: "INVALID" });
    expect(await updateNewsSettings(image(`https://${HOST}/cards/a.webp`), true)).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(await updateNewsSettings(image(`https://${HOST}/news/a.webp`), true)).toEqual({ ok: true, changed: ["home.news"] });
  });
});

describe("aperçu des visuels dans l'admin", () => {
  const items = [{ id: "cartes", visual: { kind: "cards", cardIds: ["cmvp2nn9s000008kzmfofvtxj"] } }];

  it("résout les visuels du brouillon pour un admin, dans la langue demandée", async () => {
    expect(await previewNewsVisuals(items, "en")).toEqual({ x: { kind: "none" } });
    expect(mocks.visuals).toHaveBeenCalledWith(items, "en");
    await previewNewsVisuals(items, "de");
    expect(mocks.visuals).toHaveBeenLastCalledWith(items, "fr");
  });

  it("ne lit rien pour un non-admin, une entrée invalide ou trop de demandes", async () => {
    mocks.admin.mockResolvedValueOnce(null);
    expect(await previewNewsVisuals(items, "fr")).toEqual({});
    expect(await previewNewsVisuals([{ id: "x", visual: { kind: "booster", slug: "../x" } }], "fr")).toEqual({});
    expect(await previewNewsVisuals("tout", "fr")).toEqual({});
    mocks.rateLimit.mockResolvedValueOnce({ success: false });
    expect(await previewNewsVisuals(items, "fr")).toEqual({});
    expect(mocks.visuals).not.toHaveBeenCalled();
  });
});
