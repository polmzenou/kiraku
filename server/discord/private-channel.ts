import "server-only";
import { env } from "../env";
import { DiscordApiError, discordBotRequest } from "./api";
import { discordStaffRole } from "@/lib/discord/staff";

type Overwrite = { id: string; type: number; allow: string; deny: string };
type Role = { id: string; permissions: string };
const VIEW = 1n << 10n;

/** Refuse de relayer les incidents dans un salon lisible par un rôle ordinaire. */
export async function assertPrivateDiscordChannel(channelId: string): Promise<void> {
  const [channel, roles] = await Promise.all([
    discordBotRequest<{ guild_id: string; type: number; permission_overwrites: Overwrite[] }>(`/channels/${channelId}`),
    discordBotRequest<Role[]>(`/guilds/${env.DISCORD_GUILD_ID}/roles`),
  ]);
  if (channel.guild_id !== env.DISCORD_GUILD_ID || channel.type !== 0) throw new DiscordApiError(403);
  const everyone = channel.permission_overwrites.find((item) => item.id === env.DISCORD_GUILD_ID && item.type === 0);
  if (!everyone || !(BigInt(everyone.deny) & VIEW) || (BigInt(everyone.allow) & VIEW)) throw new DiscordApiError(403);
  for (const overwrite of channel.permission_overwrites) {
    if (!(BigInt(overwrite.allow) & VIEW)) continue;
    if (overwrite.type === 1) {
      if (overwrite.id !== env.AUTH_DISCORD_ID) throw new DiscordApiError(403);
    } else {
      const role = roles.find((item) => item.id === overwrite.id);
      if (!role || !discordStaffRole(role, env.DISCORD_GUILD_ID!)) throw new DiscordApiError(403);
    }
  }
}
