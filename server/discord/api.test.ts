import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ env: { DISCORD_BOT_TOKEN: "private-bot-token" } }));
import { DiscordApiError, discordBotRequest, discordPaused, editInteractionReply } from "./api";

const request = vi.fn<typeof fetch>();
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

// L'ordre compte : la pause d'un 429 vaut pour tout le module (un processus), comme en production
describe("limites et réponses de l'API Discord", () => {
  it("rend tout de suite la connexion d'une erreur, sans lire son corps", async () => {
    const response = new Response("corps à ne pas journaliser", { status: 403 });
    const cancel = vi.spyOn(response.body!, "cancel");
    request.mockResolvedValue(response);
    await expect(discordBotRequest("/channels/1")).rejects.toMatchObject({ status: 403 });
    expect(cancel).toHaveBeenCalled();
    expect(discordPaused()).toBe(false);
  });
  it("après un 429 de seau, arrête le passage du cron sans bloquer les autres appels", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ retry_after: 2, global: false }), { status: 429 }));
    await expect(discordBotRequest("/channels/1/messages", "POST", {})).rejects.toMatchObject({ status: 429, retryAfterMs: 2000 });
    expect(discordPaused()).toBe(true);
    request.mockResolvedValueOnce(new Response(JSON.stringify({ id: "1" })));
    await expect(discordBotRequest("/channels/2")).resolves.toEqual({ id: "1" });
  });
  it("pendant une limite globale, refuse les appels du bot avant la requête, pas les réponses d'interaction", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ retry_after: 30, global: true }), { status: 429 }));
    await expect(discordBotRequest("/users/@me")).rejects.toBeInstanceOf(DiscordApiError);
    request.mockClear();
    const refused = await discordBotRequest("/channels/1").catch((e: unknown) => e);
    expect(refused).toMatchObject({ status: 429 });
    expect((refused as DiscordApiError).retryAfterMs).toBeGreaterThan(25_000);
    expect(request).not.toHaveBeenCalled();
    expect(discordPaused()).toBe(true);
    request.mockResolvedValueOnce(new Response("{}"));
    await editInteractionReply("123456789012345678", "interaction-token", "ok");
    expect(request).toHaveBeenCalledOnce();
  });
});
