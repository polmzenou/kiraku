import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES_DEFAULT } from "@/lib/showcase/themes";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rateLimit: vi.fn(),
  setting: vi.fn(),
  stats: vi.fn(),
  findShowcase: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  autofill: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("../showcase/queries", () => ({ getShowcaseCards: vi.fn(), listShowcases: vi.fn() }));
vi.mock("../user", () => ({ requireActiveUser: mocks.user }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../settings", () => ({ getSetting: mocks.setting }));
vi.mock("../profile/progress", () => ({ getProfileStats: mocks.stats }));
vi.mock("../db", () => ({ prisma: { showcase: { findFirst: mocks.findShowcase } } }));
vi.mock("../showcase/autofill", () => ({ autofillCards: mocks.autofill }));
vi.mock("../showcase/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../showcase/core")>()),
  createShowcaseWith: mocks.create,
  updateShowcaseWith: mocks.update,
}));
import { createShowcaseAction, updateShowcaseAction } from "./showcases";

const stats = (byRarity: Record<string, number>) => ({
  uniqueCards: 0,
  byRarity,
  completedSeries: new Set(),
  seriesProgress: {},
  boostersOpened: 0,
  tradesDone: 0,
  apocalypseRuined: 0,
  tier: "BRONZE",
  discoveredPercent: 0,
  discoveredByRarity: {},
  ambassador: false,
});

const create = (patch: Record<string, unknown> = {}) => ({ name: "", layout: "GRID_3X2", theme: "none", autofill: null, ...patch });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "player" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.setting.mockImplementation(async (key: string) => (key === "showcase.themes" ? THEMES_DEFAULT : 6));
  mocks.stats.mockResolvedValue(stats({}));
  mocks.create.mockResolvedValue("new-showcase");
  mocks.update.mockResolvedValue([null]);
});

describe("création d'une vitrine", () => {
  it("crée une vitrine avec un nom nettoyé", async () => {
    expect(await createShowcaseAction(create({ name: "  Mes   héroïnes \n" }))).toEqual({ ok: true, id: "new-showcase" });
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), "player", expect.objectContaining({ name: "Mes héroïnes", layout: "GRID_3X2", theme: "none" }), 6);
  });

  it("refuse sans session, un nom trop long ou une disposition inconnue", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect(await createShowcaseAction(create())).toEqual({ ok: false, error: "NO_SESSION" });
    expect(await createShowcaseAction(create({ name: "x".repeat(33) }))).toEqual({ ok: false, error: "INVALID" });
    expect(await createShowcaseAction(create({ layout: "GRID" }))).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("Black edition demande une Black Rare", async () => {
    expect(await createShowcaseAction(create({ theme: "black-edition" }))).toEqual({ ok: false, error: "THEME_LOCKED" });
    mocks.stats.mockResolvedValue(stats({ BR: 1 }));
    expect(await createShowcaseAction(create({ theme: "black-edition" }))).toEqual({ ok: true, id: "new-showcase" });
  });

  it("refuse un thème annoncé, même condition remplie", async () => {
    mocks.stats.mockResolvedValue(stats({ VR: 5 }));
    expect(await createShowcaseAction(create({ theme: "eclat" }))).toEqual({ ok: false, error: "THEME_LOCKED" });
  });

  it("remplit avec les meilleures cartes sur la capacité de la disposition", async () => {
    mocks.autofill.mockResolvedValue(["a", "b", null, null, null, null]);
    await createShowcaseAction(create({ autofill: { series: null, minRarity: "MYTHIC" } }));
    expect(mocks.autofill).toHaveBeenCalledWith("player", 6, { series: null, minRarity: "MYTHIC" });
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), "player", expect.objectContaining({ cards: ["a", "b", null, null, null, null] }), 6);
  });
});

describe("réglages d'une vitrine", () => {
  it("garde un thème déjà posé sans revérifier la condition", async () => {
    mocks.findShowcase.mockResolvedValue({ theme: "black-edition" });
    expect(await updateShowcaseAction({ showcaseId: "sc1", theme: "black-edition", layout: "SOLO" })).toEqual({ ok: true, slots: [null] });
    expect(mocks.stats).not.toHaveBeenCalled();
  });

  it("revérifie la condition pour passer à un autre thème", async () => {
    mocks.findShowcase.mockResolvedValue({ theme: "none" });
    expect(await updateShowcaseAction({ showcaseId: "sc1", theme: "black-edition" })).toEqual({ ok: false, error: "THEME_LOCKED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("vitrine introuvable pour un autre joueur", async () => {
    mocks.findShowcase.mockResolvedValue(null);
    expect(await updateShowcaseAction({ showcaseId: "sc1", theme: "byobu" })).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
