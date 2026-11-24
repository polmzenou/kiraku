import { describe, expect, it } from "vitest";
import { describeNotification, type DescribeTranslators } from "./describe";

const tr: DescribeTranslators = {
  notifications: (key, values) => `${key}:${JSON.stringify(values ?? {})}`,
  guestName: (code) => `Invité ${code}`,
  rarity: (r) => r.toLowerCase(),
};

describe("describeNotification", () => {
  it("demande d'ami → onglet des demandes", () => {
    const d = describeNotification({ type: "FRIEND_REQUEST", actor: { username: "akira", isGuest: false }, gift: null, card: null }, tr);
    expect(d.href).toBe("/amis?onglet=demandes");
    expect(d.text).toContain('"name":"akira"');
  });

  it("carte offerte → fiche de la carte, avec sa rareté traduite", () => {
    const d = describeNotification(
      {
        type: "GIFT_RECEIVED",
        actor: { username: "akira", isGuest: false },
        gift: { kind: "CARD", cardId: "c1" },
        card: { anilistId: 42, name: "Rei", rarity: "EPIC" },
      },
      tr,
    );
    expect(d.href).toBe("/collection/42");
    expect(d.text).toContain('"rarity":"epic"');
  });

  it("import Kyara versé ou refusé → page de l'import, avec les nombres ou le motif", () => {
    const base = { actor: { username: "akira", isGuest: false }, gift: null, card: null };
    const done = describeNotification({ ...base, type: "KYARA_IMPORT_DONE", kyara: { kind: "DONE", cards: 120, zeni: 340 } }, tr);
    expect(done).toEqual({ text: 'kyaraImportDone:{"cards":120,"zeni":340}', href: "/compte/import-kyara" });
    const rejected = describeNotification({ ...base, type: "KYARA_IMPORT_REJECTED", kyara: { kind: "REJECTED", code: "NOT_FRIEND" } }, tr);
    expect(rejected).toEqual({ text: 'kyaraImportRejected:{"reason":"NOT_FRIEND"}', href: "/compte/import-kyara" });
    // Contenu illisible : motif générique
    expect(describeNotification({ ...base, type: "KYARA_IMPORT_REJECTED", kyara: null }, tr).text).toContain('"reason":"OTHER"');
  });

  it("versement du parrainage v2 → page Parrainage, avec l'étape, le côté et le ×2", () => {
    const base = { actor: { username: "lea", isGuest: false }, gift: null, card: null };
    const step = describeNotification({ ...base, type: "REFERRAL_REWARD", referral: { kind: "STEP", side: "REFERRER", step: 2, milestone: null, multiplier: 2 } }, tr);
    expect(step.href).toBe("/parrainage");
    expect(step.text).toBe('referralReward:{"name":"lea","kind":"STEP","side":"REFERRER","step":"2","milestone":0,"multiplier":2}');
    const milestone = describeNotification({ ...base, type: "REFERRAL_REWARD", referral: { kind: "MILESTONE", side: null, step: null, milestone: 10, multiplier: 1 } }, tr);
    expect(milestone.text).toContain('"kind":"MILESTONE"');
    expect(milestone.text).toContain('"milestone":10');
    // Contenu illisible : texte générique
    expect(describeNotification({ ...base, type: "REFERRAL_REWARD", referral: null }, tr).text).toContain('"kind":"OTHER"');
  });

  it("lot de l'Ennichi → la page de la fête, du banzuke ou de l'omikuji", () => {
    const base = { actor: null, gift: null, card: null };
    const tier = describeNotification({ ...base, type: "ENNICHI_REWARD", ennichi: { kind: "TIER", edition: 1, tier: 2, rank: null, draw: null } }, tr);
    expect(tier).toEqual({ text: 'ennichiReward:{"kind":"TIER","tier":"3","rank":0,"draw":0}', href: "/ennichi" });
    expect(describeNotification({ ...base, type: "ENNICHI_REWARD", ennichi: { kind: "BANZUKE", edition: 1, tier: null, rank: 2, draw: null } }, tr).href).toBe("/ennichi/banzuke");
    expect(describeNotification({ ...base, type: "ENNICHI_REWARD", ennichi: { kind: "OMIKUJI", edition: 1, tier: null, rank: null, draw: 7 } }, tr).href).toBe("/ennichi/omikuji");
    expect(describeNotification({ ...base, type: "ENNICHI_REWARD", ennichi: null }, tr).text).toContain('"kind":"OTHER"');
  });

  it("pile ou face : invitation et table relevée → page de la table, sans jamais l'issue", () => {
    const base = { actor: { username: "kenji", isGuest: false }, gift: null, card: { anilistId: 40, name: "Luffy", rarity: "MYTHIC" } };
    const coinFlip = { flipId: "t1", cardId: "c1", reason: null };
    const invite = describeNotification({ ...base, type: "COINFLIP_INVITE", coinFlip }, tr);
    expect(invite.href).toBe("/casino/pile-ou-face/t1");
    const resolved = describeNotification({ ...base, type: "COINFLIP_RESOLVED", coinFlip }, tr);
    expect(resolved.href).toBe("/casino/pile-ou-face/t1");
    expect(resolved.text).toMatch(/^coinFlipResolved:/);
    expect(resolved.text).toContain('"card":"Luffy"');
  });

  it("pile ou face : carte rendue selon la raison → fiche de la carte", () => {
    const base = { actor: { username: "kenji", isGuest: false }, gift: null, card: { anilistId: 40, name: "Luffy", rarity: "MYTHIC" } };
    const text = (reason: "EXPIRED" | "DECLINED" | "ADMIN" | null) =>
      describeNotification({ ...base, type: "COINFLIP_RETURNED", coinFlip: { flipId: "t1", cardId: "c1", reason } }, tr);
    expect(text("EXPIRED").text).toMatch(/^coinFlipExpired:/);
    expect(text("DECLINED").text).toMatch(/^coinFlipDeclined:/);
    expect(text("ADMIN").text).toMatch(/^coinFlipAdmin:/);
    expect(text(null).text).toMatch(/^coinFlipExpired:/);
    expect(text("EXPIRED").href).toBe("/collection/40");
  });

  it("expédition rentrée → page des expéditions, issue à demi dévoilée", () => {
    const base = { type: "EXPEDITION_RETURNED" as const, actor: { username: "akira", isGuest: false }, gift: null, card: null };
    expect(describeNotification({ ...base, expedition: { outcome: "TRIUMPH" } }, tr)).toEqual({ text: "expeditionTriumph:{}", href: "/expedition" });
    expect(describeNotification({ ...base, expedition: { outcome: "FAILURE" } }, tr).text).toBe("expeditionFailure:{}");
    expect(describeNotification({ ...base, expedition: null }, tr).text).toBe("expeditionReturned:{}");
  });

  it("Encens offerts par l'équipe → accueil, avec la quantité", () => {
    const d = describeNotification(
      { type: "TEAM_GIFT", actor: null, gift: null, card: null, team: { kind: "INCENSE", quantity: 3, boosterSlug: null } },
      tr,
    );
    expect(d).toEqual({ text: 'teamGiftIncense:{"count":3}', href: "/" });
  });

  it("avis de recherche : rempli et alerte → fiche de collection, expiré → onglet des avis, avec le prix", () => {
    const base = { actor: { username: "mika", isGuest: false }, gift: null, card: { anilistId: 7, name: "Makima", rarity: "MYTHIC" } };
    const buyOrder = { orderId: "o1", cardId: "c1", amount: 1200 };
    const filled = describeNotification({ ...base, type: "BUY_ORDER_FILLED", buyOrder }, tr);
    expect(filled).toEqual({ text: 'buyOrderFilled:{"name":"mika","card":"Makima","amount":1200}', href: "/collection/7" });
    expect(describeNotification({ ...base, type: "BUY_ORDER_WANTED", buyOrder }, tr).href).toBe("/collection/7");
    expect(describeNotification({ ...base, type: "BUY_ORDER_EXPIRED", buyOrder }, tr).href).toBe("/marche?onglet=avis");
    // Carte disparue : lien vers les avis, texte générique
    const gone = describeNotification({ ...base, card: null, type: "BUY_ORDER_WANTED", buyOrder }, tr);
    expect(gone.href).toBe("/marche?onglet=avis");
    expect(gone.text).toContain("aCard");
  });

  it("sans auteur : « un joueur »", () => {
    const d = describeNotification({ type: "FRIEND_ACCEPTED", actor: null, gift: null, card: null }, tr);
    expect(d.href).toBe("/amis");
    expect(d.text).toContain("someone");
  });
});
