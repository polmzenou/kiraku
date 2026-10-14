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

  it("sans auteur : « un joueur »", () => {
    const d = describeNotification({ type: "FRIEND_ACCEPTED", actor: null, gift: null, card: null }, tr);
    expect(d.href).toBe("/amis");
    expect(d.text).toContain("someone");
  });
});
