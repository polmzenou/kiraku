import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: vi.fn(), rateLimit: vi.fn(), update: vi.fn(), executeRaw: vi.fn(), universes: vi.fn() }));
vi.mock("../user", () => ({ getCurrentUser: m.user }));
vi.mock("../ratelimit", () => ({ rateLimit: m.rateLimit }));
vi.mock("../db", () => ({ prisma: { user: { update: m.update }, $executeRaw: m.executeRaw } }));
vi.mock("../catalog/spoiler-universes", () => ({ getSpoilerUniverses: m.universes }));

import { resetSpoilerUniversesAction, setSpoilerBlurAction, setSpoilerUniverseAction } from "./spoiler";

const KEY = "cmh1jjk0000000000000univ";

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "u1" });
  m.rateLimit.mockResolvedValue({ success: true });
  m.update.mockResolvedValue({});
  m.executeRaw.mockResolvedValue(1);
  m.universes.mockResolvedValue([{ key: KEY, name: "Jujutsu Kaisen", cards: 3 }]);
});

describe("actions du mode spoiler", () => {
  it("exigent une session, sans rien écrire", async () => {
    m.user.mockResolvedValue(null);
    expect(await setSpoilerBlurAction({ blur: false })).toEqual({ ok: false, error: "NO_SESSION" });
    expect(await setSpoilerUniverseAction({ key: KEY, shown: true })).toEqual({ ok: false, error: "NO_SESSION" });
    expect(await resetSpoilerUniversesAction()).toEqual({ ok: false, error: "NO_SESSION" });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.executeRaw).not.toHaveBeenCalled();
  });

  it("refusent une entrée invalide avant le rate limit", async () => {
    expect(await setSpoilerBlurAction({ blur: "non" })).toEqual({ ok: false, error: "INVALID" });
    expect(await setSpoilerBlurAction({ blur: true, spoilerShown: [KEY] })).toEqual({ ok: false, error: "INVALID" });
    expect(await setSpoilerUniverseAction({ key: `${KEY}"]{}`, shown: true })).toEqual({ ok: false, error: "INVALID" });
    expect(m.rateLimit).not.toHaveBeenCalled();
  });

  it("passent par le rate limit du joueur", async () => {
    m.rateLimit.mockResolvedValue({ success: false });
    expect(await setSpoilerBlurAction({ blur: false })).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(m.rateLimit).toHaveBeenCalledWith("spoiler:u1", { limit: 60, windowSeconds: 60 });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("enregistrent le flou sur le seul compte de la session", async () => {
    expect(await setSpoilerBlurAction({ blur: false })).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { spoilerBlur: false } });
  });

  it("ne remettent en clair qu'un univers qui a des cartes spoil", async () => {
    expect(await setSpoilerUniverseAction({ key: "cmh9autre000000000000univ", shown: true })).toEqual({ ok: false, error: "UNKNOWN_UNIVERSE" });
    expect(m.executeRaw).not.toHaveBeenCalled();
    expect(await setSpoilerUniverseAction({ key: KEY, shown: true })).toEqual({ ok: true });
    expect(m.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("signalent une liste pleine quand aucune ligne n'est touchée", async () => {
    m.executeRaw.mockResolvedValue(0);
    expect(await setSpoilerUniverseAction({ key: KEY, shown: true })).toEqual({ ok: false, error: "FULL" });
  });

  it("refloutent n'importe quelle clé lisible, même un univers disparu", async () => {
    m.universes.mockResolvedValue([]);
    expect(await setSpoilerUniverseAction({ key: KEY, shown: false })).toEqual({ ok: true });
    expect(m.universes).not.toHaveBeenCalled();
    expect(m.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("« Tout reflouter » vide la liste", async () => {
    expect(await resetSpoilerUniversesAction()).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { spoilerShown: [] } });
  });
});
