import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  DISCORD_BOT_TOKEN: "test-bot-token" as string | undefined,
  DISCORD_LINK_CHANNEL_ID: "123456789012345678" as string | undefined,
}));
vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ env: config }));

import { notifyDiscordLink } from "./link-notification";

const request = vi.fn<typeof fetch>();
const link = { discordId: "987654321098765432", username: "sakura", displayName: "Sakura" };

beforeEach(() => {
  config.DISCORD_BOT_TOKEN = "test-bot-token";
  config.DISCORD_LINK_CHANNEL_ID = "123456789012345678";
  request.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", request);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("annonce Discord de première liaison", () => {
  it.each(["DISCORD_BOT_TOKEN", "DISCORD_LINK_CHANNEL_ID"] as const)("ne contacte pas Discord sans %s", async (key) => {
    config[key] = undefined;
    expect(await notifyDiscordLink(link)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("publie sous l'identité du bot dans le salon choisi, avec le pseudo Discord", async () => {
    expect(await notifyDiscordLink(link)).toBe(true);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/123456789012345678/messages");
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bot test-bot-token" }, cache: "no-store", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init!.body as string)).toEqual({
      content: "🔗 **Sakura** (@sakura) vient de lier son compte Discord à Kiraku !",
      allowed_mentions: { parse: [] },
      nonce: "link:987654321098765432",
      enforce_nonce: true,
    });
  });

  it("empêche les noms d'injecter des mentions ou de la mise en forme", async () => {
    await notifyDiscordLink({ ...link, displayName: "**@everyone**\n[piège](https://example.com)" });
    const body = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(body.content).toContain("\\*\\*@everyone\\*\\* \\[piège\\]\\(https://example.com\\)");
    expect(body.content).not.toContain("\n");
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it.each([401, 403, 429, 500])("ne bloque pas la liaison si Discord répond %s", async (status) => {
    request.mockResolvedValue(new Response("ne pas journaliser ce corps", { status }));
    await expect(notifyDiscordLink(link)).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(`[discord] annonce de liaison non envoyée (${status}).`);
  });

  it("absorbe une erreur réseau sans révéler le jeton dans les logs", async () => {
    request.mockRejectedValue(new Error("erreur contenant test-bot-token"));
    await expect(notifyDiscordLink(link)).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("[discord] annonce de liaison non envoyée (réseau ou délai dépassé).");
  });
});
