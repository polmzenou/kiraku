import "server-only";
import type { SelfRole } from "@/lib/discord/community";
import { env } from "../env";

export function selfRoles(): SelfRole[] {
  const roles: Array<Omit<SelfRole, "id"> & { id: string | undefined }> = [
    { key: "merchant", id: env.DISCORD_MERCHANT_ROLE_ID, label: "Marchand", description: "Recevoir les notifications des nouvelles ventes et des échanges." },
    { key: "collector", id: env.DISCORD_COLLECTOR_ROLE_ID, label: "Collectionneur", description: "Afficher ton intérêt pour les cartes et la collection." },
    { key: "fighter", id: env.DISCORD_FIGHTER_ROLE_ID, label: "Fighter", description: "Recevoir les annonces de fin et de début de saison classée." },
  ];
  const protectedIds = [env.DISCORD_GUILD_ID, env.DISCORD_MEMBER_ROLE_ID, env.DISCORD_LINKED_ROLE_ID];
  return roles.filter((role): role is SelfRole => Boolean(role.id) && !protectedIds.includes(role.id));
}

export function linkedRoleConfigured(): boolean {
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID && env.DISCORD_LINKED_ROLE_ID && env.DISCORD_LINKED_ROLE_ID !== env.DISCORD_MEMBER_ROLE_ID && env.DISCORD_LINKED_ROLE_ID !== env.DISCORD_GUILD_ID);
}

export function rolesPanelConfigured(): boolean {
  return Boolean(env.DISCORD_BOT_TOKEN && env.AUTH_DISCORD_ID && env.DISCORD_PUBLIC_KEY && env.DISCORD_GUILD_ID && env.DISCORD_MEMBER_ROLE_ID && env.DISCORD_ROLES_CHANNEL_ID && selfRoles().length);
}

const MANAGEMENT = [1n << 1n, 1n << 2n, 1n << 3n, 1n << 4n, 1n << 5n, 1n << 13n, 1n << 27n, 1n << 28n, 1n << 29n, 1n << 34n, 1n << 40n].reduce((a, b) => a | b, 0n);

export function safeCommunityRole(role: { id: string; managed?: boolean; permissions: string }, guildId: string): boolean {
  try { return role.id !== guildId && !role.managed && (BigInt(role.permissions) & MANAGEMENT) === 0n; }
  catch { return false; }
}
