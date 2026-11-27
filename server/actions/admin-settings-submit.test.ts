import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENNICHI_FORM_KEYS, type EnnichiSettings } from "@/lib/settings/ennichi-form";
import { FEATURE_SETTING_KEYS, type FeatureSettings } from "@/lib/settings/features-form";
import { MARKET_SETTING_KEYS, type MarketSettings } from "@/lib/settings/market-form";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/settings/defaults";

// Formulaires de réglages : une page restée ouverte n'écrit que ce que l'admin a modifié à l'écran, et un réglage
// modifié qui a changé en base depuis fait refuser l'enregistrement (STALE).

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  staff: vi.fn(),
  rateLimit: vi.fn(),
  rarities: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  lock: vi.fn(),
  log: vi.fn(),
  lots: vi.fn(),
  updateTag: vi.fn(),
  forget: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));
vi.mock("../admin", () => ({ getAdmin: mocks.admin, getStaff: mocks.staff }));
vi.mock("../ratelimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("../settings", () => ({ forgetSettings: mocks.forget, SETTINGS_TAG: "settings" }));
vi.mock("../admin/log", () => ({ writeAdminLog: mocks.log }));
vi.mock("../catalog/rarities", () => ({ getRarities: mocks.rarities }));
vi.mock("../home/news", () => ({ resolveNewsVisuals: vi.fn() }));
vi.mock("../db", () => ({
  prisma: {
    lot: { count: mocks.lots },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mocks.lock, gameSetting: { findMany: mocks.findMany, upsert: mocks.upsert } }),
  },
}));
import { updateEnnichiSettings, updateFeatureSettings, updateMarketSettings } from "./admin-settings";

const defaults = <K extends SettingKey>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, SETTING_DEFAULTS[k]]));
/** Lignes GameSetting en base. */
const storeRows = (values: Record<string, unknown>) => mocks.findMany.mockResolvedValue(Object.entries(values).map(([key, value]) => ({ key, value })));
const writtenKeys = () => mocks.upsert.mock.calls.map((c) => c[0].where.key);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.staff.mockResolvedValue({ user: { id: "dev", role: "DEV" } });
  mocks.rateLimit.mockResolvedValue({ success: true });
  // Registre complet, variantes comprises : les raretés des échanges ouverts (listings.allowedRarities) y sont vérifiées
  mocks.rarities.mockResolvedValue(["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "BR", "AR", "VR", "GOLD", "MR", "SR", "XR"]);
  storeRows({});
});

describe("enregistrement depuis une page restée ouverte", () => {
  const page = defaults(FEATURE_SETTING_KEYS) as FeatureSettings;
  const shop = page["shop.enabled"];
  const market = page["market.enabled"];

  it("n'écrit que la clé modifiée à l'écran, même si une autre a changé en base depuis", async () => {
    // Un autre membre de l'équipe a basculé le marché après l'ouverture de la page
    storeRows({ ...page, "market.enabled": !market });
    const res = await updateFeatureSettings({ base: page, draft: { ...page, "shop.enabled": !shop } });
    expect(res).toEqual({ ok: true, changed: ["shop.enabled"] });
    expect(writtenKeys()).toEqual(["shop.enabled"]);
    // Journal : une ligne, l'avant relu en base
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.log.mock.calls[0][1]).toMatchObject({ targetId: "shop.enabled", before: shop, after: !shop });
    // Lignes verrouillées avant la lecture, caches oubliés après l'écriture
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
    expect(mocks.forget).toHaveBeenCalled();
  });

  it("une clé déjà à la valeur voulue n'est ni un conflit ni une écriture", async () => {
    storeRows({ ...page, "shop.enabled": !shop });
    const res = await updateFeatureSettings({ base: page, draft: { ...page, "shop.enabled": !shop, "market.enabled": !market } });
    expect(res).toEqual({ ok: true, changed: ["market.enabled"] });
    expect(writtenKeys()).toEqual(["market.enabled"]);
  });

  it("refuse l'ancien format (brouillon seul) sans rien écrire", async () => {
    expect(await updateFeatureSettings(page)).toEqual({ ok: false, error: "INVALID" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("conflits", () => {
  const page = defaults(MARKET_SETTING_KEYS) as MarketSettings;

  it("STALE quand la clé modifiée a changé en base : rien d'écrit, cache oublié pour la page rechargée", async () => {
    // Taxe à 5 % à l'ouverture de la page ; un autre l'a passée à 3 %, l'admin voulait 7 %
    storeRows({ ...page, "market.feeBp": 300 });
    const res = await updateMarketSettings({ base: page, draft: { ...page, "market.feeBp": 700, "market.pollSeconds": 10 } });
    expect(res).toEqual({ ok: false, error: "STALE" });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.updateTag).toHaveBeenCalledWith("settings");
    expect(mocks.forget).toHaveBeenCalled();
  });

  it("STALE quand les contrôles croisés du schéma échouent sur les valeurs qui seraient en vigueur", async () => {
    // L'admin relève le prix de départ minimal ; un autre a baissé le prix maximal sous ce minimum entre-temps
    storeRows({ ...page, "market.maxPrice": 100 });
    const res = await updateMarketSettings({ base: page, draft: { ...page, "market.minStartPrice": 500 } });
    expect(res).toEqual({ ok: false, error: "STALE" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("Ennichi : la fête ne s'allume pas sur un palier vidé entre-temps par un autre", async () => {
    const stored = defaults(ENNICHI_FORM_KEYS) as EnnichiSettings;
    const page: EnnichiSettings = { ...stored, "ennichi.tiers": stored["ennichi.tiers"].map((t) => ({ ...t, choiceVouchers: 1 })) };
    storeRows(stored);
    expect(await updateEnnichiSettings({ base: page, draft: { ...page, "ennichi.enabled": true } })).toEqual({ ok: false, error: "STALE" });
    expect(mocks.upsert).not.toHaveBeenCalled();
    // Un brouillon qui allume la fête avec un palier vide reste refusé comme invalide
    expect(await updateEnnichiSettings({ base: stored, draft: { ...stored, "ennichi.enabled": true } })).toEqual({ ok: false, error: "INVALID" });
  });
});
