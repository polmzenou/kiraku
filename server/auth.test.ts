import type { NextAuthConfig } from "next-auth";
import type Discord from "next-auth/providers/discord";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn().mockReturnValue({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
  transaction: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  credit: vi.fn(),
  publish: vi.fn(),
  attach: vi.fn(),
  setting: vi.fn(),
  after: vi.fn(),
  notify: vi.fn(),
  linkedRole: false,
  queueRole: vi.fn(),
  syncRole: vi.fn(),
  config: {
    discordEnabled: true,
    discordLinkConfigured: true,
    env: { AUTH_SECRET: "test-auth-secret", AUTH_DISCORD_ID: "test-client", AUTH_DISCORD_SECRET: "test-client-secret", ADMIN_DISCORD_ID: undefined },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ default: mocks.init }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./auth-adapter", () => ({ kirakuAdapter: () => ({}) }));
vi.mock("./db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./economy/ledger", () => ({ credit: mocks.credit }));
vi.mock("./economy/referral", () => ({ attachFromCookie: mocks.attach }));
vi.mock("./env", () => mocks.config);
vi.mock("./players", () => ({ availableUsername: vi.fn(), publishProfileOnSignup: mocks.publish }));
vi.mock("./session", () => ({ SESSION_COOKIE: { name: "session", options: {} }, SESSION_MAX_AGE: 3600 }));
vi.mock("./settings", () => ({ getSetting: mocks.setting }));
vi.mock("./admin/log", () => ({ writeAdminLog: vi.fn() }));
vi.mock("./discord/link-notification", () => ({ notifyDiscordLink: mocks.notify }));
vi.mock("./discord/roles-config", () => ({ linkedRoleConfigured: () => mocks.linkedRole }));
vi.mock("./discord/roles", () => ({ queueLinkedDiscordRole: mocks.queueRole, syncLinkedDiscordRole: mocks.syncRole }));

import "./auth";

const config = mocks.init.mock.calls[0][0] as NextAuthConfig;
const onLink = config.events!.linkAccount!;
const event = {
  user: { id: "player", name: "PseudoKiraku" },
  account: { provider: "discord", type: "oauth" as const, providerAccountId: "987654321098765432" },
  profile: { id: "oauth-profile", name: "Sakura", discordUsername: "sakura" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.linkedRole = false;
  mocks.config.discordLinkConfigured = true;
  mocks.findUnique.mockResolvedValue({ username: "PseudoKiraku", email: null });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.setting.mockResolvedValue(500);
  mocks.notify.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany },
  }));
});

describe("annonce à la première liaison Auth.js", () => {
  it("conserve le nom d'utilisateur Discord ainsi que l'avatar et le nom d'affichage Auth.js", async () => {
    const provider = config.providers[0] as ReturnType<typeof Discord>;
    const profile = await provider.options!.profile!({
      id: "987654321098765432", username: "sakura", global_name: "Sakura", avatar: null,
      discriminator: "0", email: "sakura@example.com",
      mfa_enabled: false, banner: null, accent_color: null, locale: "fr", verified: true,
      flags: 0, premium_type: 0, public_flags: 0, display_name: null, avatar_decoration: null,
      banner_color: null, image_url: "",
    }, {});
    expect(profile).toMatchObject({ name: "Sakura", discordUsername: "sakura", email: "sakura@example.com" });
    expect(profile.image).toMatch(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
  });

  it("attend la validation de la transaction et envoie après la réponse, même sans bonus", async () => {
    mocks.setting.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback({ user: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany } });
      expect(mocks.after).not.toHaveBeenCalled();
      return result;
    });
    await onLink(event);
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.notify).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.notify).toHaveBeenCalledWith({ discordId: "987654321098765432", username: "sakura", displayName: "Sakura" });
  });

  it("n'annonce pas une nouvelle liaison d'un joueur déjà lié", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await onLink(event);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("ne programme aucun envoi si la transaction échoue", async () => {
    mocks.transaction.mockRejectedValue(new Error("transaction annulée"));
    await expect(onLink(event)).rejects.toThrow("transaction annulée");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("laisse les annonces désactivées sans configuration du bot", async () => {
    mocks.config.discordLinkConfigured = false;
    await onLink(event);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.credit).toHaveBeenCalledOnce();
  });

  it("ignore les autres fournisseurs", async () => {
    await onLink({ ...event, account: { ...event.account, provider: "other" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("synchronise le rôle après une liaison validée même si le bonus était déjà acquis", async () => {
    mocks.linkedRole = true;
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await onLink(event);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.queueRole).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.queueRole).toHaveBeenCalledWith(event.account.providerAccountId);
    expect(mocks.syncRole).toHaveBeenCalledWith(event.account.providerAccountId);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
