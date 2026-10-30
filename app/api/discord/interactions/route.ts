import { after } from "next/server";
import { z } from "@/lib/zod";
import { RULES_BUTTON_ID } from "@/lib/discord/community";
import { env, discordRulesConfigured } from "@/server/env";
import { discordBotRequest, editInteractionReply } from "@/server/discord/api";
import { discordRequestBody, validDiscordSignature } from "@/server/discord/signature";

export const runtime = "nodejs";
export const maxDuration = 30;

const snowflake = z.string().regex(/^\d{17,20}$/);
const interactionSchema = z.object({
  application_id: snowflake,
  type: z.number().int(),
  token: z.string().min(1).max(512).optional(),
  guild_id: snowflake.optional(),
  channel_id: snowflake.optional(),
  data: z.object({ custom_id: z.string(), component_type: z.number() }).optional(),
  member: z.object({
    user: z.object({ id: snowflake, bot: z.boolean().optional() }),
    roles: z.array(snowflake),
    pending: z.boolean().optional(),
  }).optional(),
  message: z.object({ author: z.object({ id: snowflake, bot: z.boolean().optional() }) }).optional(),
});

const reply = (content: string) => Response.json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });

export async function POST(request: Request) {
  if (!env.DISCORD_PUBLIC_KEY) return new Response("Discord non configuré", { status: 503 });
  const body = await discordRequestBody(request);
  if (!body) return new Response("Corps trop volumineux", { status: 413 });
  if (!validDiscordSignature(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), env.DISCORD_PUBLIC_KEY)) {
    return new Response("Signature invalide", { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(body.toString("utf8")); } catch { return new Response("JSON invalide", { status: 400 }); }
  const parsed = interactionSchema.safeParse(json);
  if (!parsed.success) return new Response("Interaction invalide", { status: 400 });
  const input = parsed.data;
  if (!env.AUTH_DISCORD_ID || input.application_id !== env.AUTH_DISCORD_ID) return new Response("Application invalide", { status: 401 });
  if (input.type === 1) return Response.json({ type: 1 });
  if (!discordRulesConfigured) return reply("L’accueil est en cours de configuration. Réessaie plus tard.");
  if (input.type !== 3 || input.data?.component_type !== 2 || input.data.custom_id !== RULES_BUTTON_ID ||
      input.guild_id !== env.DISCORD_GUILD_ID || input.channel_id !== env.DISCORD_RULES_CHANNEL_ID ||
      !input.member || input.member.user.bot || input.message?.author.id !== env.AUTH_DISCORD_ID || !input.token) {
    return reply("Ce bouton n’est pas disponible ici.");
  }
  if (input.member.pending) return reply("Termine d’abord la validation native du règlement demandée par Discord.");
  if (input.member.roles.includes(env.DISCORD_MEMBER_ROLE_ID!)) return reply("Tu as déjà accès à la communauté Kiraku. 🌸");

  // Accusé de réception immédiat (< 3 s). L'API des rôles et la confirmation tournent après.
  const userId = input.member.user.id;
  const token = input.token;
  after(async () => {
    let content: string;
    try {
      // PUT idempotent : ajoute seulement Membre, sans remplacer les autres rôles.
      await discordBotRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, "PUT");
      content = "✅ Règlement accepté ! Tu as maintenant accès à la communauté Kiraku. 🌸";
    } catch {
      console.warn("[discord] attribution du rôle Membre impossible.");
      content = "Je n’ai pas pu t’attribuer le rôle Membre. Réessaie ; si le problème persiste, contacte l’équipe.";
    }
    await editInteractionReply(input.application_id, token, content).catch(() => console.warn("[discord] confirmation privée non envoyée."));
  });
  return Response.json({ type: 5, data: { flags: 64 } });
}
