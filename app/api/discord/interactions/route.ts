import { after } from "next/server";
import { z } from "@/lib/zod";
import { RULES_BUTTON_ID, VERIFY_BUTTON_ID, SELF_ROLE_PREFIX } from "@/lib/discord/community";
import { env, appUrl, discordRulesConfigured } from "@/server/env";
import { DiscordApiError, discordBotRequest, editInteractionReply } from "@/server/discord/api";
import { discordRequestBody, validDiscordSignature } from "@/server/discord/signature";
import { linkedRoleConfigured, rolesPanelConfigured, selfRoles } from "@/server/discord/roles-config";
import { assertCommunityRole } from "@/server/discord/role-permissions";
import { recordDiscordAlert, resolveDiscordAlert } from "@/server/discord/alert-store";

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
  if (input.type !== 3 || input.data?.component_type !== 2 ||
      input.guild_id !== env.DISCORD_GUILD_ID ||
      !input.member || input.member.user.bot || input.message?.author.id !== env.AUTH_DISCORD_ID || !input.token) {
    return reply("Ce bouton n’est pas disponible ici.");
  }
  if (input.member.pending) return reply("Termine d’abord la validation native du règlement demandée par Discord.");
  const acceptingRules = input.data.custom_id === RULES_BUTTON_ID;
  if (acceptingRules) {
    if (!discordRulesConfigured) return reply("L’accueil est en cours de configuration. Réessaie plus tard.");
    if (input.channel_id !== env.DISCORD_RULES_CHANNEL_ID) return reply("Ce bouton n’est pas disponible ici.");
    if (input.member.roles.includes(env.DISCORD_MEMBER_ROLE_ID!)) return reply("Tu as déjà accès à la communauté Kiraku. 🌸");
  } else {
    if (!rolesPanelConfigured() || input.channel_id !== env.DISCORD_ROLES_CHANNEL_ID) return reply("Ce bouton n’est pas disponible ici.");
    if (!input.member.roles.includes(env.DISCORD_MEMBER_ROLE_ID!)) return reply("Accepte d’abord le règlement pour choisir tes rôles.");
  }
  const role = selfRoles().find((item) => `${SELF_ROLE_PREFIX}${item.key}` === input.data!.custom_id);
  const verifying = input.data.custom_id === VERIFY_BUTTON_ID;
  if (!acceptingRules && !verifying && !role) return reply("Ce bouton n’est pas disponible ici.");

  // Accusé de réception immédiat (< 3 s). L'API des rôles et la confirmation tournent après.
  const userId = input.member.user.id;
  const token = input.token;
  after(async () => {
    let content: string;
    try {
      if (acceptingRules) {
        // PUT idempotent : ajoute seulement Membre, sans remplacer les autres rôles.
        await discordBotRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${env.DISCORD_MEMBER_ROLE_ID}`, "PUT");
        content = "✅ Règlement accepté ! Tu as maintenant accès à la communauté Kiraku. 🌸";
        if (linkedRoleConfigured()) {
          try {
            const linked = await import("@/server/discord/roles");
            await linked.queueLinkedDiscordRole(userId);
            await linked.syncLinkedDiscordRole(userId);
          } catch { console.warn("[discord] vérification du compte reportée au cron."); }
        }
      } else if (verifying) {
        const linked = await import("@/server/discord/roles");
        await linked.queueLinkedDiscordRole(userId);
        const result = await linked.syncLinkedDiscordRole(userId);
        content = result === "linked" ? "✅ Ton compte Kiraku est lié : le rôle vérifié est attribué." :
          result === "unlinked" ? `Aucun compte Kiraku actif lié à ce Discord. [Lie ton compte ici](${appUrl()}/compte), puis réessaie.` :
          result === "disabled" ? "Le rôle vérifié est en cours de configuration." : "La vérification sera réessayée automatiquement. Tu peux aussi réessayer plus tard.";
      } else {
        await assertCommunityRole(role!.id);
        const remove = input.member!.roles.includes(role!.id);
        await discordBotRequest(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${role!.id}`, remove ? "DELETE" : "PUT");
        content = `${remove ? "➖" : "✅"} Rôle ${role!.label} ${remove ? "retiré" : "ajouté"}.`;
      }
      await resolveDiscordAlert("interaction-role", `${acceptingRules ? "member" : role?.key ?? "verify"}:${userId}`);
    } catch (error) {
      console.warn("[discord] attribution du rôle impossible.");
      await recordDiscordAlert("interaction-role", `${acceptingRules ? "member" : role?.key ?? "verify"}:${userId}`, error instanceof DiscordApiError ? error.status : undefined);
      content = "Je n’ai pas pu modifier ton rôle. Réessaie ; si le problème persiste, contacte l’équipe.";
    }
    await editInteractionReply(input.application_id, token, content).catch(() => console.warn("[discord] confirmation privée non envoyée."));
  });
  return Response.json({ type: 5, data: { flags: 64 } });
}
