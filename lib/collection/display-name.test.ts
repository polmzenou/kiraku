import { describe, expect, it } from "vitest";
import { displayNameFor, shownNameFor, type NamedPlayer } from "./display-name";

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

describe("pseudo révélé à l'admin", () => {
  const labels = { hidden: "Joueur", deleted: "Compte supprimé" };

  it("montre le vrai pseudo d'un joueur caché, marqué révélé", () => {
    expect(shownNameFor(player({ profileVisibility: "PRIVATE" }), "admin", none, labels, true)).toEqual({ name: "Kaito", revealed: true });
    expect(shownNameFor(player({ profileVisibility: "FRIENDS" }), "admin", none, labels, true)).toEqual({ name: "Kaito", revealed: true });
    expect(shownNameFor(player({ bannedAt: new Date() }), "admin", none, labels, true)).toEqual({ name: "Kaito", revealed: true });
    expect(shownNameFor(player(), "admin", { friends: false, blocked: true }, labels, true)).toEqual({ name: "Kaito", revealed: true });
  });

  it("ne marque pas un pseudo déjà visible de tous, ni le sien", () => {
    expect(shownNameFor(player(), "admin", none, labels, true)).toEqual({ name: "Kaito", revealed: false });
    expect(shownNameFor(player({ profileVisibility: "PRIVATE" }), "p1", none, labels, true)).toEqual({ name: "Kaito", revealed: false });
  });

  it("garde le libellé pour un compte supprimé, et pour tout autre lecteur", () => {
    expect(shownNameFor(player({ anonymizedAt: new Date() }), "admin", none, labels, true)).toEqual({ name: "Compte supprimé", revealed: false });
    expect(shownNameFor(player({ profileVisibility: "PRIVATE" }), "v1", none, labels)).toEqual({ name: "Joueur", revealed: false });
    expect(shownNameFor(player({ profileVisibility: "PRIVATE" }), "v1", none, labels, false)).toEqual({ name: "Joueur", revealed: false });
  });
});
