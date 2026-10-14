import { describe, expect, it } from "vitest";
import { balancesAfter, isValidAmount, isValidSignedAmount, MAX_MOVEMENT } from "./amount";
import { ledgerHref, ledgerWhere, parseLedgerFilter } from "./ledger-view";
import { lotInputSchema, parseLotItemRow } from "./lots";
import { measureKey, missionInputSchema, missionState, raritiesFrom, shownProgress } from "./missions";
import { checkAttach, isQualified, missingSteps, normalizeReferralCode, type AttachCheck, type ReferralRules } from "./referral";
import { limitPeriodKey, onSaleForZeni, remainingPurchases, shopItemInputSchema } from "./shop";

const NOW = new Date("2026-10-14T12:00:00Z");
const HOUR = 3_600_000;

describe("montants de Zeni", () => {
  it("n'accepte que des entiers positifs bornés", () => {
    expect(isValidAmount(1)).toBe(true);
    expect(isValidAmount(MAX_MOVEMENT)).toBe(true);
    for (const bad of [0, -5, 1.5, NaN, Infinity, MAX_MOVEMENT + 1]) expect(isValidAmount(bad)).toBe(false);
  });

  it("une ligne de journal est signée mais jamais nulle", () => {
    expect(isValidSignedAmount(-200)).toBe(true);
    expect(isValidSignedAmount(0)).toBe(false);
    expect(isValidSignedAmount(-(MAX_MOVEMENT + 1))).toBe(false);
  });

  it("recalcule le solde après chaque ligne d'un débit groupé", () => {
    // Solde final 400 après trois boosters à 200 : 1 000 → 800 → 600 → 400
    expect(balancesAfter(400, [-200, -200, -200])).toEqual([800, 600, 400]);
    expect(balancesAfter(150, [100, -50])).toEqual([200, 150]);
  });
});

describe("missions", () => {
  it("état : en cours, à réclamer, réclamée", () => {
    expect(missionState(2, 5, false)).toBe("IN_PROGRESS");
    expect(missionState(5, 5, false)).toBe("CLAIMABLE");
    expect(missionState(9, 5, true)).toBe("CLAIMED");
  });

  it("la barre ne déborde pas", () => {
    expect(shownProgress(12, 5)).toBe(5);
    expect(shownProgress(-1, 5)).toBe(0);
  });

  it("« au moins Épique » accepte aussi Légendaire et Mythique", () => {
    expect(raritiesFrom("EPIC")).toEqual(["EPIC", "LEGENDARY", "MYTHIC"]);
  });

  it("deux missions qui mesurent la même chose partagent leur calcul", () => {
    expect(measureKey({ metric: "OPEN_BOOSTERS", period: "DAILY", rarity: null })).toBe(
      measureKey({ metric: "OPEN_BOOSTERS", period: "DAILY", rarity: "RARE" }),
    );
    expect(measureKey({ metric: "PULL_RARITY", period: "DAILY", rarity: "RARE" })).not.toBe(
      measureKey({ metric: "PULL_RARITY", period: "DAILY", rarity: "EPIC" }),
    );
  });

  const base = {
    key: "jour-ouvrir-5",
    period: "DAILY",
    metric: "OPEN_BOOSTERS",
    goal: 5,
    rarity: null,
    title: null,
    lotId: "lot1",
    active: true,
    sortOrder: 0,
  };

  it("valide une mission de l'admin", () => {
    expect(missionInputSchema.safeParse(base).success).toBe(true);
  });

  it("une rareté va avec « tirer une rareté », et seulement elle", () => {
    expect(missionInputSchema.safeParse({ ...base, metric: "PULL_RARITY" }).success).toBe(false);
    expect(missionInputSchema.safeParse({ ...base, metric: "PULL_RARITY", rarity: "EPIC" }).success).toBe(true);
    expect(missionInputSchema.safeParse({ ...base, rarity: "EPIC" }).success).toBe(false);
  });

  it("refuse les champs inconnus et les objectifs absurdes", () => {
    expect(missionInputSchema.safeParse({ ...base, coins: 1_000_000 }).success).toBe(false);
    expect(missionInputSchema.safeParse({ ...base, goal: 0 }).success).toBe(false);
    expect(missionInputSchema.safeParse({ ...base, metric: "VISIT", goal: 3 }).success).toBe(false);
  });
});

describe("lots", () => {
  it("un lot vide ne récompense rien", () => {
    expect(lotInputSchema.safeParse({ name: { fr: "Vide", en: "" }, zeni: 0, items: [], active: true }).success).toBe(false);
  });

  it("chaque élément porte exactement ce que son type demande", () => {
    const lot = { name: { fr: "Lot", en: "" }, zeni: 0, active: true };
    expect(lotInputSchema.safeParse({ ...lot, items: [{ kind: "BOOSTER", boosterTypeId: "t1", quantity: 2 }] }).success).toBe(true);
    expect(lotInputSchema.safeParse({ ...lot, items: [{ kind: "BOOSTER", cardId: "c1", quantity: 2 }] }).success).toBe(false);
    expect(lotInputSchema.safeParse({ ...lot, items: [{ kind: "RARITY_CARD", rarity: "EPIC", quantity: 0 }] }).success).toBe(false);
  });

  it("une ligne incohérente en base est ignorée au versement", () => {
    expect(parseLotItemRow({ kind: "CARD", boosterTypeId: null, cardId: null, rarity: null, quantity: 1 })).toBeNull();
    expect(parseLotItemRow({ kind: "RARITY_CARD", boosterTypeId: null, cardId: null, rarity: "RARE", quantity: 2 })).toEqual({
      kind: "RARITY_CARD",
      rarity: "RARE",
      quantity: 2,
    });
  });
});

describe("parrainage", () => {
  const rules: ReferralRules = {
    enabled: true,
    attachWindowDays: 7,
    maxPerMonth: 10,
    minAccountAgeHours: 48,
    minBoostersOpened: 20,
    requireVerified: true,
  };
  const player = (id: string, over: Partial<AttachCheck["referee"]> = {}) => ({
    id,
    isGuest: false,
    bannedAt: null,
    createdAt: new Date(NOW.getTime() - 24 * HOUR),
    ...over,
  });
  const check = (over: Partial<AttachCheck> = {}): AttachCheck => ({
    referee: player("filleul"),
    referrer: player("parrain"),
    alreadyReferred: false,
    reverse: false,
    blocked: false,
    referrerRecent: 0,
    now: NOW,
    rules,
    ...over,
  });

  it("normalise un code saisi à la main", () => {
    expect(normalizeReferralCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeReferralCode("ABCD0FGH")).toBeNull(); // 0 n'existe pas dans l'alphabet
    expect(normalizeReferralCode("ABC")).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });

  it("accepte un filleul inscrit récent", () => {
    expect(checkAttach(check())).toBeNull();
  });

  it("refuse soi-même, un invité, un deuxième parrain, un compte trop ancien", () => {
    expect(checkAttach(check({ referrer: player("filleul") }))).toBe("SELF");
    expect(checkAttach(check({ referee: player("filleul", { isGuest: true }) }))).toBe("GUEST");
    expect(checkAttach(check({ alreadyReferred: true }))).toBe("ALREADY_REFERRED");
    expect(checkAttach(check({ referee: player("filleul", { createdAt: new Date(NOW.getTime() - 8 * 24 * HOUR) }) }))).toBe("TOO_LATE");
  });

  it("un parrain invité, banni, bloqué ou en cycle répond comme un code inconnu", () => {
    expect(checkAttach(check({ referrer: player("parrain", { isGuest: true }) }))).toBe("INVALID_CODE");
    expect(checkAttach(check({ referrer: player("parrain", { bannedAt: NOW }) }))).toBe("INVALID_CODE");
    expect(checkAttach(check({ blocked: true }))).toBe("INVALID_CODE");
    expect(checkAttach(check({ reverse: true }))).toBe("INVALID_CODE");
  });

  it("plafond mensuel du parrain", () => {
    expect(checkAttach(check({ referrerRecent: 10 }))).toBe("REFERRER_FULL");
  });

  it("qualification : compte, vérification, âge et activité", () => {
    const ok = { isGuest: false, bannedAt: null, createdAt: new Date(NOW.getTime() - 72 * HOUR), verified: true, boostersOpened: 20 };
    expect(isQualified(ok, rules, NOW)).toBe(true);
    expect(missingSteps({ ...ok, verified: false, boostersOpened: 3 }, rules, NOW)).toEqual(["VERIFIED", "BOOSTERS"]);
    expect(missingSteps({ ...ok, createdAt: new Date(NOW.getTime() - HOUR) }, rules, NOW)).toEqual(["AGE"]);
    expect(isQualified({ ...ok, bannedAt: NOW }, rules, NOW)).toBe(false);
    expect(isQualified({ ...ok, verified: false }, { ...rules, requireVerified: false }, NOW)).toBe(true);
  });
});

describe("boutique", () => {
  const item = { active: true, priceZeni: 900, perUserLimit: null, limitPeriod: null, startsAt: null, endsAt: null };

  it("en vente seulement s'il est actif, daté et a un prix en Zeni", () => {
    expect(onSaleForZeni(item, NOW)).toBe(true);
    expect(onSaleForZeni({ ...item, active: false }, NOW)).toBe(false);
    expect(onSaleForZeni({ ...item, priceZeni: null }, NOW)).toBe(false);
    expect(onSaleForZeni({ ...item, startsAt: new Date(NOW.getTime() + HOUR) }, NOW)).toBe(false);
    expect(onSaleForZeni({ ...item, endsAt: NOW }, NOW)).toBe(false);
  });

  it("fenêtre de la limite d'achat", () => {
    expect(limitPeriodKey(null, NOW, "Europe/Paris")).toBe("all");
    expect(limitPeriodKey("ONCE", NOW, "Europe/Paris")).toBe("all");
    expect(limitPeriodKey("DAILY", NOW, "Europe/Paris")).toBe("2026-10-14");
    expect(limitPeriodKey("WEEKLY", NOW, "Europe/Paris")).toBe("2026-W42");
  });

  it("achats restants", () => {
    expect(remainingPurchases(null, 99)).toBeNull();
    expect(remainingPurchases(3, 1)).toBe(2);
    expect(remainingPurchases(3, 5)).toBe(0);
  });

  const input = {
    slug: "pack-5",
    name: { fr: "Pack", en: "" },
    description: { fr: "", en: "" },
    lotId: "lot1",
    priceZeni: 900,
    priceCents: null,
    stripePriceId: null,
    perUserLimit: null,
    limitPeriod: null,
    startsAt: null,
    endsAt: null,
    active: true,
    sortOrder: 0,
  };

  it("valide un article de l'admin", () => {
    expect(shopItemInputSchema.safeParse(input).success).toBe(true);
    expect(shopItemInputSchema.safeParse({ ...input, perUserLimit: 2 }).success).toBe(false); // sans période
    expect(shopItemInputSchema.safeParse({ ...input, priceZeni: null }).success).toBe(false); // aucun prix
    expect(shopItemInputSchema.safeParse({ ...input, priceZeni: -1 }).success).toBe(false);
    expect(shopItemInputSchema.safeParse({ ...input, stripePriceId: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("historique des Zeni", () => {
  it("filtre connu ou « tout »", () => {
    expect(parseLedgerFilter("in")).toBe("in");
    expect(parseLedgerFilter("SHOP")).toBe("SHOP");
    expect(parseLedgerFilter("DROP TABLE")).toBe("all");
    expect(ledgerWhere("out")).toEqual({ amount: { lt: 0 } });
    expect(ledgerWhere("MISSION")).toEqual({ reason: "MISSION" });
  });

  it("lien vers la source de la ligne", () => {
    expect(ledgerHref("BOOSTER", "abc")).toBe("/tirage/abc");
    expect(ledgerHref("BOOSTER", null)).toBeNull();
    expect(ledgerHref("SIGNUP", null)).toBeNull();
    expect(ledgerHref("MISSION", "m:2026-10-14")).toBe("/missions");
  });
});
