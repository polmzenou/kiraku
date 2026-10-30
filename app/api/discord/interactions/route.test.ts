import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES_BUTTON_ID, SELF_ROLE_PREFIX, VERIFY_BUTTON_ID } from "@/lib/discord/community";

const config = vi.hoisted(() => ({
  AUTH_DISCORD_ID: "123456789012345678",
  DISCORD_PUBLIC_KEY: "" as string | undefined,
  DISCORD_BOT_TOKEN: "secret-bot-token",
  DISCORD_GUILD_ID: "1565773684243697905",
  DISCORD_RULES_CHANNEL_ID: "1565778336947634266",
  DISCORD_MEMBER_ROLE_ID: "1565774539886039142",
  DISCORD_ROLES_CHANNEL_ID: "1565778506120433664",
  DISCORD_MERCHANT_ROLE_ID: "1565817691132928121",
  DISCORD_COLLECTOR_ROLE_ID: "1565818296002154506",
  DISCORD_FIGHTER_ROLE_ID: "1565818436355887214",
  DISCORD_LINKED_ROLE_ID: undefined as string | undefined,
}));
const jobs = vi.hoisted(() => [] as Array<() => Promise<void>>);
const linked = vi.hoisted(() => ({ queue: vi.fn(), sync: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ env: config, discordRulesConfigured: true, appUrl: () => "https://kiraku.example" }));
vi.mock("@/server/discord/roles", () => ({ queueLinkedDiscordRole: linked.queue, syncLinkedDiscordRole: linked.sync }));
vi.mock("next/server", () => ({ after: (job: () => Promise<void>) => jobs.push(job) }));
import { POST } from "./route";

const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const request = vi.fn<typeof fetch>();
const userId = "234567890123456789";
const fixture = () => ({
  application_id: config.AUTH_DISCORD_ID, type: 3, token: "private-interaction-token",
  guild_id: config.DISCORD_GUILD_ID, channel_id: config.DISCORD_RULES_CHANNEL_ID,
  data: { component_type: 2, custom_id: RULES_BUTTON_ID },
  member: { user: { id: userId }, roles: [] as string[], pending: false },
  message: { author: { id: config.AUTH_DISCORD_ID, bot: true } },
});

function signed(body: unknown, ageSeconds = 0) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000) - ageSeconds);
  const signature = sign(null, Buffer.from(timestamp + raw), keys.privateKey).toString("hex");
  return new Request("https://kiraku.example/api/discord/interactions", { method: "POST", body: raw, headers: {
    "x-signature-ed25519": signature, "x-signature-timestamp": timestamp,
  } });
}

beforeEach(() => {
  jobs.length = 0;
  config.DISCORD_LINKED_ROLE_ID = undefined;
  linked.queue.mockReset();
  linked.sync.mockReset().mockResolvedValue("linked");
  config.DISCORD_PUBLIC_KEY = publicKey;
  request.mockReset().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", request);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const roleFixture = (customId = `${SELF_ROLE_PREFIX}merchant`, roles = [config.DISCORD_MEMBER_ROLE_ID]) => ({
  ...fixture(), channel_id: config.DISCORD_ROLES_CHANNEL_ID,
  member: { ...fixture().member, roles }, data: { component_type: 2, custom_id: customId },
});

describe("choix de rôles et vérification de compte", () => {
  it("exige Membre, le salon rôles et un bouton de préférence connu", async () => {
    for (const input of [roleFixture(undefined, []), { ...roleFixture(), channel_id: config.DISCORD_RULES_CHANNEL_ID }, roleFixture(`${SELF_ROLE_PREFIX}administrator`), roleFixture(`${SELF_ROLE_PREFIX}${config.DISCORD_MEMBER_ROLE_ID}`)]) {
      expect((await (await POST(signed(input))).json()).type).toBe(4);
    }
    expect(jobs).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    ["merchant", config.DISCORD_MERCHANT_ROLE_ID], ["collector", config.DISCORD_COLLECTOR_ROLE_ID], ["fighter", config.DISCORD_FIGHTER_ROLE_ID],
  ])("ajoute et retire seulement le rôle de préférence %s", async (key, roleId) => {
    request.mockReset().mockImplementation(async (_url, init) => new Response(init?.method === "GET" ? JSON.stringify([{ id: roleId, permissions: "0" }]) : "{}"));
    expect(await (await POST(signed(roleFixture(`${SELF_ROLE_PREFIX}${key}`)))).json()).toEqual({ type: 5, data: { flags: 64 } });
    expect(request).not.toHaveBeenCalled();
    await jobs[0]();
    expect(request.mock.calls[1]).toMatchObject([expect.stringContaining(`/members/${userId}/roles/${roleId}`), { method: "PUT" }]);
    await POST(signed(roleFixture(`${SELF_ROLE_PREFIX}${key}`, [config.DISCORD_MEMBER_ROLE_ID, roleId])));
    await jobs[1]();
    expect(request.mock.calls[4]).toMatchObject([expect.stringContaining(`/members/${userId}/roles/${roleId}`), { method: "DELETE" }]);
  });
  it("refuse d'attribuer un rôle de préférence devenu administrateur", async () => {
    request.mockReset().mockImplementation(async (_url, init) => new Response(init?.method === "GET" ? JSON.stringify([{ id: config.DISCORD_MERCHANT_ROLE_ID, permissions: "8" }]) : "{}"));
    await POST(signed(roleFixture()));
    await jobs[0]();
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "PATCH"]);
    expect(JSON.parse(request.mock.calls[1][1]!.body as string).content).toContain("pas pu");
  });
  it("vérifie le compte depuis la base et confirme en privé", async () => {
    request.mockReset().mockResolvedValue(new Response("{}"));
    await POST(signed(roleFixture(VERIFY_BUTTON_ID)));
    expect(linked.sync).not.toHaveBeenCalled();
    await jobs[0]();
    expect(linked.queue).toHaveBeenCalledWith(userId);
    expect(linked.sync).toHaveBeenCalledWith(userId);
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).content).toContain("rôle vérifié est attribué");
  });
  it("propose la liaison au lieu de donner le rôle à un compte non lié", async () => {
    linked.sync.mockResolvedValue("unlinked");
    request.mockReset().mockResolvedValue(new Response("{}"));
    await POST(signed(roleFixture(VERIFY_BUTTON_ID)));
    await jobs[0]();
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).content).toContain("https://kiraku.example/compte");
    expect(request.mock.calls.every(([, init]) => init?.method === "PATCH")).toBe(true);
  });
  it("synchronise aussi le compte lié après acceptation du règlement", async () => {
    config.DISCORD_LINKED_ROLE_ID = "1565817846720757880";
    await POST(signed(fixture()));
    await jobs[0]();
    expect(linked.sync).toHaveBeenCalledWith(userId);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("interactions Discord signées", () => {
  it("répond au PING signé de Discord sans appeler l'API", async () => {
    expect(await (await POST(signed({ type: 1, application_id: config.AUTH_DISCORD_ID }))).json()).toEqual({ type: 1 });
    expect(request).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(0);
  });
  it("refuse une signature absente ou un corps modifié", async () => {
    expect((await POST(new Request("https://kiraku.example", { method: "POST", body: "{}" }))).status).toBe(401);
    const original = signed(fixture());
    const tampered = new Request(original.url, { method: "POST", headers: original.headers, body: JSON.stringify({ ...fixture(), guild_id: "999999999999999999" }) });
    expect((await POST(tampered)).status).toBe(401);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([301, -60])("refuse un horodatage hors fenêtre (%s secondes)", async (age) => {
    expect((await POST(signed(fixture(), age))).status).toBe(401);
  });
  it("refuse les corps trop grands et le JSON invalide", async () => {
    expect((await POST(signed("a".repeat(65_537)))).status).toBe(413);
    expect((await POST(signed("{"))).status).toBe(400);
  });
  it("refuse une autre application même avec une signature valide", async () => {
    expect((await POST(signed({ ...fixture(), application_id: "999999999999999999" }))).status).toBe(401);
    expect(jobs).toHaveLength(0);
  });
  it.each(["guild_id", "channel_id"] as const)("n'attribue rien depuis un autre %s", async (field) => {
    const response = await POST(signed({ ...fixture(), [field]: "999999999999999999" }));
    expect((await response.json()).data.flags).toBe(64);
    expect(jobs).toHaveLength(0);
  });
  it("refuse un autre bouton, un autre auteur et les messages privés", async () => {
    const base = fixture();
    for (const input of [
      { ...base, data: { component_type: 2, custom_id: "grant-admin" } },
      { ...base, message: { author: { id: userId } } },
      { ...base, member: undefined, guild_id: undefined },
    ]) await POST(signed(input));
    expect(jobs).toHaveLength(0);
  });
  it("ne contourne pas la validation native et ne retire pas un rôle déjà acquis", async () => {
    const pending = await POST(signed({ ...fixture(), member: { ...fixture().member, pending: true } }));
    expect((await pending.json()).data.content).toContain("validation native");
    const member = await POST(signed({ ...fixture(), member: { ...fixture().member, roles: [config.DISCORD_MEMBER_ROLE_ID] } }));
    expect((await member.json()).data.content).toContain("déjà accès");
    expect(jobs).toHaveLength(0);
  });
  it("accuse réception avant l'API, ajoute seulement Membre puis confirme en privé", async () => {
    const response = await POST(signed(fixture()));
    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
    expect(request).not.toHaveBeenCalled();
    await jobs[0]();
    expect(request.mock.calls[0]).toMatchObject([
      `https://discord.com/api/v10/guilds/${config.DISCORD_GUILD_ID}/members/${userId}/roles/${config.DISCORD_MEMBER_ROLE_ID}`,
      { method: "PUT", headers: { Authorization: "Bot secret-bot-token" } },
    ]);
    expect(request.mock.calls[0][1]?.body).toBeUndefined();
    const [url, init] = request.mock.calls[1];
    expect(url).toContain("/webhooks/123456789012345678/private-interaction-token/messages/@original");
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init!.body as string).content).toContain("Règlement accepté");
  });
  it("explique un refus Discord sans exposer les jetons", async () => {
    request.mockReset().mockRejectedValueOnce(new Error("secret-bot-token private-interaction-token")).mockResolvedValue(new Response("{}"));
    await POST(signed(fixture()));
    await jobs[0]();
    expect(JSON.parse(request.mock.calls[1][1]!.body as string).content).toContain("pas pu");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("secret-bot-token");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-interaction-token");
  });
  it("reste fermé quand la clé publique manque", async () => {
    config.DISCORD_PUBLIC_KEY = undefined;
    expect((await POST(signed(fixture()))).status).toBe(503);
  });
});
