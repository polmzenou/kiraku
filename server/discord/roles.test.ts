import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  DISCORD_BOT_TOKEN: "private-token", DISCORD_GUILD_ID: "1565773684243697905", DISCORD_MEMBER_ROLE_ID: "1565774539886039142",
  DISCORD_LINKED_ROLE_ID: "1565817846720757880" as string | undefined,
}));
const db = vi.hoisted(() => ({ account: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ env: config }));
vi.mock("../db", () => ({ prisma: {
  account: { findUnique: db.account }, $queryRaw: db.query,
  discordRoleSync: { upsert: db.upsert, updateMany: db.updateMany, findUniqueOrThrow: db.findUniqueOrThrow, findMany: db.findMany, createMany: db.createMany },
} }));
import { queueLinkedDiscordRole, syncLinkedDiscordRole, syncLinkedDiscordRoles } from "./roles";

const userId = "234567890123456789";
const request = vi.fn<typeof fetch>();
const activeUser = () => ({ user: { isGuest: false, bannedAt: null, anonymizedAt: null, deletionRequestedAt: null } });
let member: { roles: string[]; pending?: boolean };
let permissions: string;

beforeEach(() => {
  vi.clearAllMocks();
  config.DISCORD_LINKED_ROLE_ID = "1565817846720757880";
  member = { roles: [config.DISCORD_MEMBER_ROLE_ID, "987654321098765432"] };
  permissions = "0";
  db.account.mockResolvedValue(activeUser());
  db.updateMany.mockResolvedValue({ count: 1 });
  db.findUniqueOrThrow.mockResolvedValue({ attempts: 2 });
  db.query.mockResolvedValue([]);
  db.findMany.mockResolvedValue([]);
  request.mockImplementation(async (url, init) => {
    if (init?.method === "GET") return new Response(JSON.stringify(String(url).endsWith("/roles") ? [{ id: config.DISCORD_LINKED_ROLE_ID, permissions }] : member));
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", request);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("rôle Discord de compte Kiraku lié", () => {
  it("relit le lien OAuth actuel et ajoute uniquement le rôle vérifié", async () => {
    await queueLinkedDiscordRole(userId);
    expect(await syncLinkedDiscordRole(userId)).toBe("linked");
    expect(db.account).toHaveBeenCalledWith(expect.objectContaining({ where: { provider_providerAccountId: { provider: "discord", providerAccountId: userId } } }));
    const writes = request.mock.calls.filter(([, init]) => init?.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject([`https://discord.com/api/v10/guilds/${config.DISCORD_GUILD_ID}/members/${userId}/roles/${config.DISCORD_LINKED_ROLE_ID}`, { method: "PUT" }]);
    expect(writes[0][1]?.body).toBeUndefined();
    expect(db.updateMany.mock.calls.at(-1)![0].where).toHaveProperty("leaseId");
  });
  it("ne réattribue pas un rôle déjà présent", async () => {
    member.roles.push(config.DISCORD_LINKED_ROLE_ID!);
    expect(await syncLinkedDiscordRole(userId)).toBe("linked");
    expect(request).toHaveBeenCalledOnce();
  });
  it("retire seulement le rôle vérifié après déliaison", async () => {
    db.account.mockResolvedValue(null);
    member.roles.push(config.DISCORD_LINKED_ROLE_ID!);
    expect(await syncLinkedDiscordRole(userId)).toBe("unlinked");
    expect(request.mock.calls.at(-1)![1]?.method).toBe("DELETE");
    expect(String(request.mock.calls.at(-1)![0])).toContain(`/roles/${config.DISCORD_LINKED_ROLE_ID}`);
  });
  it.each(["isGuest", "bannedAt", "anonymizedAt", "deletionRequestedAt"] as const)("refuse un compte inéligible : %s", async (field) => {
    db.account.mockResolvedValue({ user: { ...activeUser().user, [field]: field === "isGuest" ? true : new Date() } });
    expect(await syncLinkedDiscordRole(userId)).toBe("unlinked");
    expect(request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("ne fait pas rejoindre le serveur à un compte absent", async () => {
    request.mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await syncLinkedDiscordRole(userId)).toBe("absent");
    expect(request).toHaveBeenCalledOnce();
  });
  it("attend la validation native du règlement", async () => {
    member.pending = true;
    expect(await syncLinkedDiscordRole(userId)).toBe("pending");
    expect(request).toHaveBeenCalledOnce();
  });
  it("bloque un rôle devenu administrateur et conserve un délai de reprise", async () => {
    permissions = "8";
    expect(await syncLinkedDiscordRole(userId)).toBe("error");
    expect(request.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(db.updateMany.mock.calls.at(-1)![0].data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 100_000);
  });
  it("ne concurrence pas une tâche déjà en cours", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await syncLinkedDiscordRole(userId)).toBe("pending");
    expect(request).not.toHaveBeenCalled();
  });
  it("rattrape les comptes existants par lots et réutilise la file persistante", async () => {
    db.query.mockResolvedValue([{ discordId: userId }]);
    db.findMany.mockResolvedValue([{ discordId: userId }]);
    expect(await syncLinkedDiscordRoles()).toEqual({ synced: 1, deferred: 0 });
    expect(db.createMany).toHaveBeenCalledWith({ data: [{ guildId: config.DISCORD_GUILD_ID, discordId: userId }], skipDuplicates: true });
  });
  it("reste désactivé sans configuration et ne journalise jamais le jeton", async () => {
    config.DISCORD_LINKED_ROLE_ID = undefined;
    expect(await syncLinkedDiscordRole(userId)).toBe("disabled");
    expect(request).not.toHaveBeenCalled();
    config.DISCORD_LINKED_ROLE_ID = "1565817846720757880";
    request.mockRejectedValue(new Error("private-token"));
    expect(await syncLinkedDiscordRole(userId)).toBe("error");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-token");
  });
});
