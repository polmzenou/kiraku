import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOSTER_SETTING_KEYS, type BoosterSettings } from "@/lib/settings/booster-form";
import { SETTING_DEFAULTS } from "@/lib/settings/defaults";
import { MARKET_SETTING_KEYS, type MarketSettings } from "@/lib/settings/market-form";

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
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: vi.fn(), gameSetting: { findMany: mocks.findMany, upsert: mocks.upsert } }) },
}));
import { updateBoosterSettings, updateMarketSettings } from "./admin-settings";

const REGISTRY = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "AR", "GOLD", "MR", "VR", "SR", "XR", "BR"];
const settings = (over: Partial<BoosterSettings> = {}): BoosterSettings =>
  ({ ...Object.fromEntries(BOOSTER_SETTING_KEYS.map((k) => [k, SETTING_DEFAULTS[k]])), ...over }) as BoosterSettings;
// Envoi du formulaire ouvert sur les valeurs par défaut (rien en base)
const draft = (over: Partial<BoosterSettings> = {}) => ({ base: settings(), draft: settings(over) });

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

// Une rareté inconnue y passait le schéma (clé bien formée) : l'Encens ne boostait plus rien, l'Apocalyptique ruiné
// visait une rareté sans cartes, les échanges ouverts filtraient sur une rareté qui n'existe pas
describe("autres réglages qui citent une rareté", () => {
  it.each([
    ["incense.boostFrom", "INCONNUE"],
    ["booster.apocalypseRuinCeiling", "INCONNUE"],
    ["booster.apocalypseRuinFloors", ["COMMON", "INCONNUE"]],
  ] as const)("refuse %s hors du registre", async (key, value) => {
    expect(await updateBoosterSettings(draft({ [key]: value }))).toEqual({ ok: false, error: "INVALID" });
    expect(await updateBoosterSettings(draft({ "incense.boostFrom": "MYTHIC", "booster.apocalypseRuinCeiling": "RARE" }))).toMatchObject({ ok: true });
  });

  it("refuse une rareté inconnue dans les échanges ouverts du Marché", async () => {
    const market = (over: Partial<MarketSettings> = {}) =>
      ({ ...Object.fromEntries(MARKET_SETTING_KEYS.map((k) => [k, SETTING_DEFAULTS[k]])), ...over }) as MarketSettings;
    expect(await updateMarketSettings({ base: market(), draft: market({ "listings.allowedRarities": ["COMMON", "INCONNUE"] }) })).toEqual({ ok: false, error: "INVALID" });
    expect(await updateMarketSettings({ base: market(), draft: market({ "listings.allowedRarities": ["COMMON", "GOLD"] }) })).toMatchObject({ ok: true });
  });
});
