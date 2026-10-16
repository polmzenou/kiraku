import { describe, expect, it } from "vitest";
import { displayNameFor, type NamedPlayer } from "./display-name";

const player = (o: Partial<NamedPlayer> = {}): NamedPlayer => ({
  id: "p1",
  username: "Kaito",
  profileVisibility: "PUBLIC",
  bannedAt: null,
  anonymizedAt: null,
  ...o,
});
const none = { friends: false, blocked: false };

describe("pseudo affiché hors du profil", () => {
  it("public : visible de tous, invités compris", () => {
    expect(displayNameFor(player(), null, none)).toBe("Kaito");
    expect(displayNameFor(player(), "v1", none)).toBe("Kaito");
  });

  it("privé : caché aux autres, jamais à soi-même", () => {
    expect(displayNameFor(player({ profileVisibility: "PRIVATE" }), "v1", none)).toBe("Joueur");
    expect(displayNameFor(player({ profileVisibility: "PRIVATE" }), null, none)).toBe("Joueur");
    expect(displayNameFor(player({ profileVisibility: "PRIVATE" }), "p1", none)).toBe("Kaito");
  });

  it("amis seulement : visible d'un ami accepté", () => {
    expect(displayNameFor(player({ profileVisibility: "FRIENDS" }), "v1", none)).toBe("Joueur");
    expect(displayNameFor(player({ profileVisibility: "FRIENDS" }), "v1", { friends: true, blocked: false })).toBe("Kaito");
  });

  it("caché à qui il a bloqué, et caché s'il est banni", () => {
    expect(displayNameFor(player(), "v1", { friends: false, blocked: true })).toBe("Joueur");
    expect(displayNameFor(player({ bannedAt: new Date() }), "v1", none)).toBe("Joueur");
  });
  it("anonymisé : aucun pseudo, même pour soi-même", () => {
    const deleted = player({ anonymizedAt: new Date() });
    expect(displayNameFor(deleted, null, none)).toBe("Compte supprimé");
    expect(displayNameFor(deleted, "p1", none)).toBe("Compte supprimé");
    expect(displayNameFor(deleted, "v1", none, { hidden: "Player", deleted: "Deleted account" })).toBe("Deleted account");
  });
});
