import "server-only";
import { env } from "../env";
import { DiscordApiError, discordBotRequest } from "./api";
import { safeCommunityRole } from "./roles-config";

export async function assertCommunityRole(roleId: string): Promise<void> {
  const roles = await discordBotRequest<Array<{ id: string; managed?: boolean; permissions: string }>>(`/guilds/${env.DISCORD_GUILD_ID}/roles`);
  const role = roles.find((row) => row.id === roleId);
  if (!role || !safeCommunityRole(role, env.DISCORD_GUILD_ID!)) throw new DiscordApiError(403);
}
