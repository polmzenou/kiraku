import { describe, expect, it } from "vitest";
import { bypassesProfilePrivacy, profileAccess, type ProfileOwner } from "./visibility";

const owner = (over: Partial<ProfileOwner> = {}): ProfileOwner => ({
  id: "owner",
  profileVisibility: "PUBLIC",
  showCollection: true,
  bannedAt: null,
  ...over,
});
const noFriends = { friends: false };

describe("confidentialité du profil", () => {
  it("le propriétaire voit tout, même en privé", () => {
    expect(profileAccess("owner", owner({ profileVisibility: "PRIVATE", showCollection: false }), noFriends)).toEqual({
      isOwner: true,
      profile: true,
      collection: true,
      adminOverride: false,
    });
  });

  it("un profil public se voit sans session, collection selon son réglage", () => {
    expect(profileAccess(null, owner(), noFriends)).toEqual({ isOwner: false, profile: true, collection: true, adminOverride: false });
    expect(profileAccess(null, owner({ showCollection: false }), noFriends).collection).toBe(false);
  });

  it("un profil privé est fermé aux autres", () => {
    expect(profileAccess("other", owner({ profileVisibility: "PRIVATE" }), { friends: true }).profile).toBe(false);
  });

  it("FRIENDS ne s'ouvre qu'aux amis (équivaut à privé tant qu'il n'y a pas d'amis)", () => {
    const friendsOnly = owner({ profileVisibility: "FRIENDS" });
    expect(profileAccess("other", friendsOnly, noFriends).profile).toBe(false);
    expect(profileAccess("other", friendsOnly, { friends: true }).profile).toBe(true);
  });

  it("un compte banni n'est plus montré", () => {
    expect(profileAccess("other", owner({ bannedAt: new Date() }), noFriends).profile).toBe(false);
  });

  it("un visiteur bloqué voit le profil comme un profil privé", () => {
    expect(profileAccess("other", owner(), { friends: false, blocked: true })).toEqual({
      isOwner: false,
      profile: false,
      collection: false,
      adminOverride: false,
    });
    expect(profileAccess("other", owner({ profileVisibility: "FRIENDS" }), { friends: true, blocked: true }).profile).toBe(false);
  });

  describe("passe-droit admin", () => {
    const full = { isOwner: false, profile: true, collection: true };

    it("un admin voit un profil privé et sa collection, signalé comme passe-droit", () => {
      expect(profileAccess("admin", owner({ profileVisibility: "PRIVATE", showCollection: false }), noFriends, true)).toEqual({ ...full, adminOverride: true });
      expect(profileAccess("admin", owner({ profileVisibility: "FRIENDS" }), noFriends, true)).toEqual({ ...full, adminOverride: true });
    });

    it("un profil public à collection cachée : seule la collection est un passe-droit", () => {
      expect(profileAccess("admin", owner({ showCollection: false }), noFriends, true)).toEqual({ ...full, adminOverride: true });
    });

    it("un profil déjà ouvert à tous n'est pas un passe-droit", () => {
      expect(profileAccess("admin", owner(), noFriends, true)).toEqual({ ...full, adminOverride: false });
      expect(profileAccess("admin", owner({ profileVisibility: "FRIENDS" }), { friends: true }, true)).toEqual({ ...full, adminOverride: false });
    });

    it("ni le blocage ni le bannissement n'arrêtent l'admin", () => {
      expect(profileAccess("admin", owner(), { friends: false, blocked: true }, true)).toEqual({ ...full, adminOverride: true });
      expect(profileAccess("admin", owner({ bannedAt: new Date() }), noFriends, true)).toEqual({ ...full, adminOverride: true });
    });

    it("son propre profil reste celui du propriétaire", () => {
      expect(profileAccess("owner", owner({ profileVisibility: "PRIVATE" }), noFriends, true)).toEqual({ isOwner: true, profile: true, collection: true, adminOverride: false });
    });

    it("sans session, le drapeau ne change rien", () => {
      expect(profileAccess(null, owner({ profileVisibility: "PRIVATE" }), noFriends, true)).toEqual({ isOwner: false, profile: false, collection: false, adminOverride: false });
    });

    it("joueur ordinaire inchangé : pas de passe-droit sans le drapeau", () => {
      const priv = owner({ profileVisibility: "PRIVATE", showCollection: false });
      expect(profileAccess("other", priv, noFriends)).toEqual({ isOwner: false, profile: false, collection: false, adminOverride: false });
      expect(profileAccess("other", owner({ showCollection: false }), noFriends).collection).toBe(false);
    });

    it("seul un ADMIN non banni passe outre", () => {
      expect(bypassesProfilePrivacy({ role: "ADMIN", bannedAt: null })).toBe(true);
      expect(bypassesProfilePrivacy({ role: "ADMIN", bannedAt: new Date() })).toBe(false);
      expect(bypassesProfilePrivacy({ role: "DEV", bannedAt: null })).toBe(false);
      expect(bypassesProfilePrivacy({ role: "USER", bannedAt: null })).toBe(false);
      expect(bypassesProfilePrivacy(null)).toBe(false);
    });
  });
});
