import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES_DEFAULT } from "@/lib/showcase/themes";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rateLimit: vi.fn(), rarities: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), log: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../settings", () => ({ forgetSettings: vi.fn(), SETTINGS_TAG: "settings" }));
vi.mock("../admin/log", () => ({ writeAdminLog: mocks.log }));
vi.mock("../catalog/rarities", () => ({ getRarities: mocks.rarities }));
vi.mock("../home/news", () => ({ resolveNewsVisuals: vi.fn() }));
vi.mock("../db", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ gameSetting: { findMany: mocks.findMany, upsert: mocks.upsert } }) },
}));
import { updateShowcaseSettings } from "./admin-settings";

const input = (themes: Record<string, unknown> = {}, maxPerPlayer = 6) => ({
  "showcase.maxPerPlayer": maxPerPlayer,
  "showcase.themes": { ...THEMES_DEFAULT, ...themes },
});
const written = (key: string) => mocks.upsert.mock.calls.find((c) => c[0].where.key === key)?.[0].update.value;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.rarities.mockResolvedValue(["COMMON", "RARE", "MYTHIC", "BR", "VR", "GOLD"]);
  mocks.findMany.mockResolvedValue([
    { key: "showcase.maxPerPlayer", value: 6 },
    { key: "showcase.themes", value: THEMES_DEFAULT },
  ]);
});

describe("réglages des vitrines dans l'admin", () => {
  it("refuse les non-admins sans rien écrire", async () => {
    mocks.admin.mockResolvedValue(null);
    expect(await updateShowcaseSettings(input())).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("refuse une condition sur une rareté absente du registre", async () => {
    const res = await updateShowcaseSettings(input({ eclat: { status: "AVAILABLE", condition: { type: "RARITY_OWNED", rarity: "CELESTIAL", n: 1 } } }));
    expect(res).toEqual({ ok: false, error: "INVALID" });
    const discovered = await updateShowcaseSettings(input({ ema: { status: "AVAILABLE", condition: { type: "RARITIES_DISCOVERED", rarities: ["BR", "XR"], n: 1 } } }));
    expect(discovered).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("ouvre Éclat et journalise chaque réglage modifié", async () => {
    const eclat = { status: "AVAILABLE", condition: { type: "RARITY_OWNED", rarity: "VR", n: 1 } };
    const res = await updateShowcaseSettings(input({ eclat }, 8));
    expect(res).toEqual({ ok: true, changed: ["showcase.maxPerPlayer", "showcase.themes"] });
    expect(written("showcase.maxPerPlayer")).toBe(8);
    expect((written("showcase.themes") as Record<string, unknown>).eclat).toEqual(eclat);
    expect(mocks.log).toHaveBeenCalledTimes(2);
  });

  it("garde Sans décor disponible et libre, quoi qu'envoie le client", async () => {
    await updateShowcaseSettings(input({ none: { status: "HIDDEN", condition: { type: "AMBASSADOR" } } }));
    expect(mocks.upsert).not.toHaveBeenCalled();
    await updateShowcaseSettings(input({ none: { status: "HIDDEN", condition: { type: "AMBASSADOR" } }, ema: { status: "SOON", condition: { type: "ALWAYS" } } }));
    const themes = written("showcase.themes") as Record<string, unknown>;
    expect(themes.none).toEqual({ status: "AVAILABLE", condition: { type: "ALWAYS" } });
    expect(themes.ema).toEqual({ status: "SOON", condition: { type: "ALWAYS" } });
  });

  it("limite le nombre d'enregistrements", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect(await updateShowcaseSettings(input())).toEqual({ ok: false, error: "RATE_LIMITED" });
  });
});
