import "server-only";
import { createHash } from "node:crypto";
import { env } from "../env";

export type DiscordAlertKind = "publication" | "linked-role" | "ranked-render" | "cron" | "interaction-role";

export function discordAlertsConfigured(): boolean {
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID && env.DISCORD_ALERTS_CHANNEL_ID);
}

export function discordAlertId(kind: DiscordAlertKind, sourceId: string): string {
  return createHash("sha256").update(`${env.DISCORD_GUILD_ID}:${kind}:${sourceId}`).digest("hex").slice(0, 32);
}

/** L'appelant ne transmet que des identifiants internes et un statut HTTP, jamais Error.message. */
export async function recordDiscordAlert(kind: DiscordAlertKind, sourceId: string, httpStatus?: number): Promise<void> {
  if (!discordAlertsConfigured() || !/^[a-zA-Z0-9:_-]{1,160}$/.test(sourceId)) return;
  try {
    const { prisma } = await import("../db");
    await prisma.discordAlert.upsert({
      where: { id: discordAlertId(kind, sourceId) },
      create: { id: discordAlertId(kind, sourceId), kind, sourceId, httpStatus },
      update: { occurrences: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, dirty: true, httpStatus: httpStatus ?? null },
    });
  } catch { console.warn("[discord] incident technique conservé uniquement dans les logs PM2."); }
}

export async function resolveDiscordAlert(kind: DiscordAlertKind, sourceId: string): Promise<void> {
  if (!discordAlertsConfigured()) return;
  try {
    const { prisma } = await import("../db");
    await prisma.discordAlert.updateMany({
      where: { id: discordAlertId(kind, sourceId), resolvedAt: null },
      data: { resolvedAt: new Date(), dirty: true },
    });
  } catch { console.warn("[discord] résolution de l’incident non enregistrée."); }
}
