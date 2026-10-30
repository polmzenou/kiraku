import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rulesMessage } from "@/lib/discord/community";

const db = vi.hoisted(() => ({ updateMany: vi.fn(), findUniqueOrThrow: vi.fn() }));
const alerts = vi.hoisted(() => ({ record: vi.fn(), resolve: vi.fn() }));
vi.mock("./alert-store", () => ({ recordDiscordAlert: alerts.record, resolveDiscordAlert: alerts.resolve }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { discordPost: db } }));
vi.mock("../env", () => ({ env: { DISCORD_BOT_TOKEN: "private-bot-token", AUTH_DISCORD_ID: "123456789012345678" } }));
import { publishDiscordPost } from "./posts";

type Post = { key: string; channelId: string; messageId: string | null; payloadHash: string | null; attempts: number; nextAttemptAt: Date | null; leaseId: string | null; leaseUntil: Date | null };
type Mutation = Omit<Partial<Post>, "attempts"> & { attempts?: number | { increment: number } };
let row: Post;
const request = vi.fn<typeof fetch>();
const messageId = "345678901234567890";

beforeEach(() => {
  alerts.record.mockClear();
  alerts.resolve.mockClear();
  row = { key: "rules:test", channelId: "1565778336947634266", messageId: null, payloadHash: null, attempts: 0, nextAttemptAt: new Date(), leaseId: null, leaseUntil: null };
  db.updateMany.mockReset().mockImplementation(async ({ where, data }: { where: { leaseId?: string; OR?: unknown }; data: Mutation }) => {
    if (where.OR && row.leaseUntil && row.leaseUntil > new Date()) return { count: 0 };
    if (where.leaseId && where.leaseId !== row.leaseId) return { count: 0 };
    const { attempts, ...rest } = data;
    Object.assign(row, rest);
    if (typeof attempts === "number") row.attempts = attempts;
    else if (attempts) row.attempts += attempts.increment;
    return { count: 1 };
  });
  db.findUniqueOrThrow.mockReset().mockImplementation(async () => ({ ...row }));
  request.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: messageId })));
  vi.stubGlobal("fetch", request);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("publication persistante Discord", () => {
  it("conserve l'identifiant, n'envoie pas un contenu inchangé et modifie le même message", async () => {
    expect(await publishDiscordPost(row.key, rulesMessage(), null)).toEqual({ ok: true, messageId });
    expect(row.messageId).toBe(messageId);
    const firstBody = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(firstBody.nonce).toHaveLength(24);
    expect(firstBody.enforce_nonce).toBe(true);
    await publishDiscordPost(row.key, rulesMessage(), null);
    expect(request).toHaveBeenCalledTimes(1);
    // Chaque requête renvoie son propre objet Response, comme fetch.
    request.mockImplementation(async () => new Response("{}"));
    await publishDiscordPost(row.key, { ...rulesMessage(), content: "Nouveau texte" }, null);
    expect(request.mock.calls[1]).toMatchObject([
      `https://discord.com/api/v10/channels/${row.channelId}/messages/${messageId}`, { method: "PATCH" },
    ]);
  });
  it("bloque une publication concurrente pendant l'appel réseau", async () => {
    let release!: (response: Response) => void;
    request.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
    const first = publishDiscordPost(row.key, rulesMessage(), null);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(await publishDiscordPost(row.key, rulesMessage(), null)).toEqual({ ok: false, error: "BUSY" });
    release(new Response(JSON.stringify({ id: messageId })));
    expect((await first).ok).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });
  it("conserve l'envoi à réessayer et respecte Retry-After", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ retry_after: 180 }), { status: 429, headers: { "Retry-After": "120" } }));
    expect(await publishDiscordPost(row.key, rulesMessage(), null)).toEqual({ ok: false, error: "DISCORD" });
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 179_000);
    expect(row.leaseUntil).toBeNull();
  });
  it("retrouve un message après une réponse perdue, sans créer de doublon", async () => {
    row.attempts = 1;
    request.mockResolvedValueOnce(new Response(JSON.stringify([{
      id: messageId, author: { id: "123456789012345678" }, components: rulesMessage().components,
    }]))).mockResolvedValueOnce(new Response("{}"));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(true);
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "PATCH"]);
    expect(row.messageId).toBe(messageId);
  });
  it("recrée un message supprimé lors d'une republication explicite", async () => {
    await publishDiscordPost(row.key, rulesMessage(), null);
    request.mockResolvedValueOnce(new Response("{}", { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "456789012345678901" })));
    await publishDiscordPost(row.key, rulesMessage(), null, true);
    expect(row.messageId).toBe("456789012345678901");
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "PATCH", "POST"]);
  });
  it("garde l'identifiant reçu si la première sauvegarde échoue", async () => {
    const update = db.updateMany.getMockImplementation()!;
    let calls = 0;
    db.updateMany.mockImplementation(async (args) => {
      if (++calls === 2) throw new Error("base momentanément indisponible");
      return update(args);
    });
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(row.messageId).toBe(messageId);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBeInstanceOf(Date);
  });
  it("n'expose pas les jetons après une erreur réseau", async () => {
    request.mockRejectedValueOnce(new Error("private-bot-token"));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-bot-token");
  });
  it("signale l'échec et la reprise d'une publication sans inclure de jeton", async () => {
    request.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(alerts.record).toHaveBeenCalledWith("publication", row.key, 403);
    request.mockReset().mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "GET" ? [] : { id: messageId })));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(true);
    expect(alerts.resolve).toHaveBeenCalledWith("publication", row.key);
  });
  it("ne crée jamais d'incident pour l'échec d'une alerte elle-même", async () => {
    row.key = "alert:channel:incident";
    request.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(alerts.record).not.toHaveBeenCalled();
  });
  it("notifie uniquement le rôle choisi à la création, puis actualise sans notification", async () => {
    const options = { mentionRoleId: "1565817691132928121" };
    await publishDiscordPost(row.key, rulesMessage(), null, false, options);
    const body = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(body.content).toMatch(/^<@&1565817691132928121>/);
    expect(body.allowed_mentions).toEqual({ parse: [], roles: [options.mentionRoleId] });
    request.mockResolvedValue(new Response("{}"));
    await publishDiscordPost(row.key, { ...rulesMessage(), content: "Prix modifié" }, null, false, options);
    const edit = JSON.parse(request.mock.calls[1][1]!.body as string);
    expect(edit.content).toBe("Prix modifié");
    expect(edit.allowed_mentions).toEqual({ parse: [] });
  });
  it("envoie le PNG en multipart avec un nonce et sans imposer de boundary", async () => {
    const options = { mentionRoleId: "1565818436355887214", attachment: { filename: "saison-4.png", data: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" } };
    await publishDiscordPost(row.key, rulesMessage(), null, false, options);
    const init = request.mock.calls[0][1]!;
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    const json = JSON.parse(form.get("payload_json") as string);
    expect(json.attachments).toEqual([{ id: 0, filename: "saison-4.png" }]);
    expect(json.enforce_nonce).toBe(true);
    expect(json.nonce).toHaveLength(24);
    expect(json.allowed_mentions.roles).toEqual([options.mentionRoleId]);
    const file = form.get("files[0]") as File;
    expect(file.name).toBe("saison-4.png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(options.attachment.data);
    await publishDiscordPost(row.key, rulesMessage(), null, false, options);
    expect(request).toHaveBeenCalledOnce();
  });
});
