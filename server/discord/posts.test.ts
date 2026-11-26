import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rulesMessage } from "@/lib/discord/community";

const db = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() }));
const alerts = vi.hoisted(() => ({ record: vi.fn(), resolve: vi.fn() }));
vi.mock("./alert-store", () => ({ recordDiscordAlert: alerts.record, resolveDiscordAlert: alerts.resolve }));
vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ prisma: { discordPost: db } }));
vi.mock("../env", () => ({ env: { DISCORD_BOT_TOKEN: "private-bot-token", AUTH_DISCORD_ID: "123456789012345678" } }));
import { publishDiscordPost } from "./posts";

type Post = {
  key: string; channelId: string; messageId: string | null; payloadHash: string | null; attempts: number; nextAttemptAt: Date | null;
  leaseId: string | null; leaseUntil: Date | null; sendStartedAt: Date | null; createdAt: Date;
};
type Mutation = Omit<Partial<Post>, "attempts"> & { attempts?: number | { increment: number } };
type Where = { leaseId?: string; OR?: unknown; payloadHash?: string; attempts?: number };
let row: Post;
// Autres annonces de la file, par clé (row est celle des tests à une seule annonce)
const others = new Map<string, Post>();
const pick = (key: string) => (key === row.key ? row : others.get(key)!);
const request = vi.fn<typeof fetch>();
const messageId = "345678901234567890";
const snowflakeAt = (date: Date) => ((BigInt(date.getTime()) - 1_420_070_400_000n) << 22n).toString();

beforeEach(() => {
  alerts.record.mockClear();
  alerts.resolve.mockClear();
  // Annonce mise en file en 2017 : les identifiants de message ci-dessous (snowflakes de 2017) lui sont postérieurs
  row = { key: "rules:test", channelId: "1565778336947634266", messageId: null, payloadHash: null, attempts: 0, nextAttemptAt: new Date(), leaseId: null, leaseUntil: null, sendStartedAt: null, createdAt: new Date("2017-01-01T00:00:00Z") };
  others.clear();
  db.updateMany.mockReset().mockImplementation(async ({ where, data }: { where: Where & { key: string }; data: Mutation }) => {
    const target = pick(where.key);
    if (where.OR && target.leaseUntil && target.leaseUntil > new Date()) return { count: 0 };
    if (where.leaseId && where.leaseId !== target.leaseId) return { count: 0 };
    if (where.payloadHash && where.payloadHash !== target.payloadHash) return { count: 0 };
    if (where.attempts !== undefined && where.attempts !== target.attempts) return { count: 0 };
    const { attempts, ...rest } = data;
    Object.assign(target, rest);
    if (typeof attempts === "number") target.attempts = attempts;
    else if (attempts) target.attempts += attempts.increment;
    return { count: 1 };
  });
  db.findUnique.mockReset().mockImplementation(async ({ where }: { where: { key: string } }) => ({ ...pick(where.key) }));
  db.findUniqueOrThrow.mockReset().mockImplementation(async ({ where }: { where: { key: string } }) => ({ ...pick(where.key) }));
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
    const leases = db.updateMany.mock.calls.length;
    await publishDiscordPost(row.key, rulesMessage(), new Date(Date.now() + 300_000));
    expect(request).toHaveBeenCalledTimes(1);
    // Contenu inchangé : une seule écriture (la prochaine relecture), sans lease ni incident à résoudre
    expect(db.updateMany).toHaveBeenCalledTimes(leases + 1);
    expect(db.updateMany.mock.calls.at(-1)![0].data).toEqual({ nextAttemptAt: expect.any(Date) });
    expect(row.attempts).toBe(0);
    expect(alerts.resolve).not.toHaveBeenCalled();
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
    // Refus net : rien n'a été créé, aucune reprise ne sera tentée
    expect(row.sendStartedAt).toBeNull();
  });
  it("retrouve un message après une réponse perdue, sans créer de doublon", async () => {
    row.attempts = 1;
    row.sendStartedAt = new Date();
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
      // 1 : lease, 2 : envoi noté, 3 : sauvegarde après l'envoi
      if (++calls === 3) throw new Error("base momentanément indisponible");
      return update(args);
    });
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(row.messageId).toBe(messageId);
    expect(row.sendStartedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBeInstanceOf(Date);
  });
  it("marque l'envoi incertain avant l'appel : une panne pendant l'appel déclenche la reprise", async () => {
    request.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(row.sendStartedAt).toBeInstanceOf(Date);
    expect(row.messageId).toBeNull();
  });
  it("n'expose pas les jetons après une erreur réseau", async () => {
    request.mockRejectedValueOnce(new Error("private-bot-token"));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-bot-token");
  });
  it("signale l'échec et la reprise d'une publication sans inclure de jeton", async () => {
    request.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(false);
    // Un incident par salon : une permission cassée ne crée pas un message d'alerte par annonce
    expect(alerts.record).toHaveBeenCalledWith("publication", `channel:${row.channelId}`, 403);
    request.mockReset().mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "GET" ? [] : { id: messageId })));
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(true);
    expect(alerts.resolve).toHaveBeenCalledWith("publication", `channel:${row.channelId}`);
    // Refus net (403) : la reprise n'a pas relu le salon
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(["POST"]);
  });
  it("ne résout aucun incident après une première tentative réussie", async () => {
    expect((await publishDiscordPost(row.key, rulesMessage(), null)).ok).toBe(true);
    expect(alerts.resolve).not.toHaveBeenCalled();
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

describe("reprise d'un envoi incertain entre annonces de même URL", () => {
  const BOT = "123456789012345678";
  // Deux étapes d'un même parrainage : même lien vers la fiche de suivi
  const step = (n: number) => ({ embeds: [{ title: `Étape ${n}`, url: "https://kiraku.example/admin/parrainage/suivi/r1" }], allowed_mentions: { parse: [] as [] } });
  const sentUrl = (call: number) => JSON.parse(request.mock.calls[call][1]!.body as string).embeds[0].url as string;

  it("après un 429 suivi d'un succès, crée la seconde annonce sans toucher au message de la première", async () => {
    row.key = "referral:step:r1:1";
    others.set("referral:step:r1:2", { ...row, key: "referral:step:r1:2" });
    expect(await publishDiscordPost("referral:step:r1:1", step(1), null)).toEqual({ ok: true, messageId });
    const firstUrl = sentUrl(0);
    // Repère propre à la clé sur le lien de l'encadré
    expect(firstUrl).toMatch(/^https:\/\/kiraku\.example\/admin\/parrainage\/suivi\/r1#k=[0-9a-f]{12}$/);

    const second = "456789012345678901";
    request.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({ retry_after: 1 }), { status: 429 }))
      .mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "GET"
        ? [{ id: messageId, author: { id: BOT }, embeds: [{ url: firstUrl }] }, { id: messageId, author: { id: BOT }, embeds: [{ url: "https://kiraku.example/admin/parrainage/suivi/r1" }] }]
        : { id: second })));
    expect((await publishDiscordPost("referral:step:r1:2", step(2), null)).ok).toBe(false);
    others.get("referral:step:r1:2")!.nextAttemptAt = new Date();
    expect(await publishDiscordPost("referral:step:r1:2", step(2), null)).toEqual({ ok: true, messageId: second });
    // Deux créations, aucune relecture du salon ni modification
    expect(request.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      `POST https://discord.com/api/v10/channels/${row.channelId}/messages`,
      `POST https://discord.com/api/v10/channels/${row.channelId}/messages`,
    ]);
    expect(sentUrl(1)).not.toBe(firstUrl);
    expect(row.messageId).toBe(messageId);
    expect(others.get("referral:step:r1:2")!.messageId).toBe(second);
  });

  it("après une réponse perdue, ne reprend que le message de sa clé, posté depuis sa mise en file", async () => {
    row.key = "referral:step:r1:2";
    row.createdAt = new Date("2026-11-26T10:00:00Z");
    request.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    expect((await publishDiscordPost(row.key, step(2), null)).ok).toBe(false);
    const ownUrl = sentUrl(0);
    expect(row.sendStartedAt).toBeInstanceOf(Date);

    const older = snowflakeAt(new Date("2026-11-25T10:00:00Z"));
    const otherKey = snowflakeAt(new Date("2026-11-26T10:01:00Z"));
    const own = snowflakeAt(new Date("2026-11-26T10:02:00Z"));
    request.mockReset().mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "GET" ? [
      { id: older, author: { id: BOT }, embeds: [{ url: ownUrl }] }, // même repère, mais antérieur à la mise en file
      { id: otherKey, author: { id: BOT }, embeds: [{ url: "https://kiraku.example/admin/parrainage/suivi/r1#k=000000000000" }] },
      { id: otherKey, author: { id: BOT }, embeds: [{ url: "https://kiraku.example/admin/parrainage/suivi/r1" }] },
      { id: own, author: { id: "999999999999999999" }, embeds: [{ url: ownUrl }] }, // pas le bot
      { id: own, author: { id: BOT }, embeds: [{ url: ownUrl }] },
    ] : {})));
    row.nextAttemptAt = new Date();
    expect(await publishDiscordPost(row.key, step(2), null)).toEqual({ ok: true, messageId: own });
    expect(request.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      `GET https://discord.com/api/v10/channels/${row.channelId}/messages?limit=100`,
      `PATCH https://discord.com/api/v10/channels/${row.channelId}/messages/${own}`,
    ]);
    expect(row.sendStartedAt).toBeNull();
  });
});
