import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOSTER_SETTING_KEYS, type BoosterSettings } from "@/lib/settings/booster-form";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";

// Enregistrement des doublons des grandes raretés dans /admin/boosters : raretés vérifiées par le registre.

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rateLimit: vi.fn(), rarities: vi.fn(), findMany: vi.fn(), upsert: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../settings", () => ({ forgetSettings: vi.fn(), SETTINGS_TAG: "settings" }));
vi.mock("../admin/log", () => ({ writeAdminLog: vi.fn() }));
vi.mock("../catalog/rarities", () => ({ getRarities: mocks.rarities }));
vi.mock("../home/news", () => ({ resolveNewsVisuals: vi.fn() }));
vi.mock("../db", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ gameSetting: { findMany: mocks.findMany, upsert: mocks.upsert } }) },
}));
import { updateBoosterSettings } from "./admin-settings";

const REGISTRY = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "AR", "GOLD"];
const draft = (over: Partial<BoosterSettings> = {}): BoosterSettings =>
  ({ ...Object.fromEntries(BOOSTER_SETTING_KEYS.map((k) => [k, SETTING_DEFAULTS[k]])), ...over }) as BoosterSettings;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.rarities.mockResolvedValue(REGISTRY);
  mocks.findMany.mockResolvedValue([]);
});

describe("réglages des doublons des grandes raretés", () => {
  it("enregistre des raretés du registre, la règle coupée comprise", async () => {
    expect(await updateBoosterSettings(draft({ "booster.duplicateGuardRarities": ["MYTHIC", "GOLD"], "booster.duplicateGuardDivisor": 50_000 }))).toMatchObject({ ok: true });
    expect(await updateBoosterSettings(draft({ "booster.duplicateGuardRarities": [] }))).toMatchObject({ ok: true });
  });

  it("refuse une rareté inconnue du registre, sans rien écrire", async () => {
    expect(await updateBoosterSettings(draft({ "booster.duplicateGuardRarities": ["MYTHIC", "INCONNUE"] }))).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
