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
