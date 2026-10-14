import { describe, expect, it } from "vitest";
import { profileAccess, type ProfileOwner } from "./visibility";

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
    });
  });

  it("un profil public se voit sans session, collection selon son réglage", () => {
    expect(profileAccess(null, owner(), noFriends)).toEqual({ isOwner: false, profile: true, collection: true });
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
    });
    expect(profileAccess("other", owner({ profileVisibility: "FRIENDS" }), { friends: true, blocked: true }).profile).toBe(false);
  });
});
