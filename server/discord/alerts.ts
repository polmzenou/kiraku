import "server-only";
import type { DiscordAlert } from "@/generated/prisma/client";
import type { DiscordMessageBody } from "@/lib/discord/community";
import { prisma } from "../db";
import { appUrl, env } from "../env";
import { discordAlertsConfigured } from "./alert-store";
import { assertPrivateDiscordChannel } from "./private-channel";
import { publishDiscordPost } from "./posts";

const TITLES: Record<string, string> = {
  publication: "Publication Discord en échec", "linked-role": "Synchronisation du rôle de compte lié en échec",
  "ranked-render": "Bilan de saison non publié", cron: "Traitement du cron interrompu", "interaction-role": "Attribution de rôle depuis un bouton refusée",
};
const CAUSES: Record<number, string> = {
  0: "Réseau, configuration ou base de données : consulter les logs PM2.",
  401: "Vérifier le jeton du bot sur le VPS.",
  403: "Vérifier les permissions du bot dans le salon et sa place au-dessus des rôles concernés.",
  404: "Vérifier que le salon, le rôle ou le message existe encore.",
  429: "Limite Discord atteinte : le bot réessaiera après le délai imposé.",
};
const COOLDOWN_MS = 15 * 60_000;

export function technicalAlertMessage(alert: DiscordAlert): DiscordMessageBody {
  const url = new URL("/admin/discord", appUrl());
  url.searchParams.set("incident", alert.id);
  const resolved = Boolean(alert.resolvedAt);
  return {
    content: `${resolved ? "✅ **Incident résolu**" : "⚠️ **Alerte technique Kiraku**"}`,
    embeds: [{
      title: TITLES[alert.kind] ?? "Incident Discord", url: url.href, color: resolved ? 0x71bc92 : 0xe6a14a,
      description: resolved ? "Le traitement concerné fonctionne à nouveau." : CAUSES[alert.httpStatus ?? 0] ?? "Erreur Discord : consulter les logs PM2.",
      fields: [
        { name: "Référence", value: `\`${alert.sourceId}\`` },
        { name: "Occurrences", value: String(alert.occurrences), inline: true },
        { name: "Statut HTTP", value: alert.httpStatus ? String(alert.httpStatus) : "Non disponible", inline: true },
        { name: "Dernier échec", value: `<t:${Math.floor(alert.lastSeenAt.getTime() / 1000)}:F>` },
      ],
      footer: { text: "Un message par incident · actualisation limitée à une fois toutes les 15 minutes" },
    }],
    allowed_mentions: { parse: [] },
  };
}

export async function syncDiscordAlerts(deadline = Date.now() + 20_000): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  if (!discordAlertsConfigured() || Date.now() + 15_000 > deadline) return result;
  try { await assertPrivateDiscordChannel(env.DISCORD_ALERTS_CHANNEL_ID!); }
  catch { console.warn("[discord] salon des alertes inaccessible ou non privé."); return { sent: 0, failed: 1 }; }
  const alerts = await prisma.discordAlert.findMany({
    where: { dirty: true, nextAttemptAt: { lte: new Date() }, AND: [
      { OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lte: new Date(Date.now() - COOLDOWN_MS) } }] },
      { OR: [{ resolvedAt: null }, { lastNotifiedAt: { not: null } }] },
    ] }, orderBy: { nextAttemptAt: "asc" }, take: 5,
  });
  for (const alert of alerts) {
    if (Date.now() + 10_000 > deadline) break;
    const key = `alert:${env.DISCORD_ALERTS_CHANNEL_ID}:${alert.id}`;
    try {
      await prisma.discordPost.upsert({ where: { key }, update: {}, create: { key, channelId: env.DISCORD_ALERTS_CHANNEL_ID! } });
      const outcome = await publishDiscordPost(key, technicalAlertMessage(alert), null);
      if (!outcome.ok) throw new Error("Envoi différé");
      await prisma.discordAlert.updateMany({
        where: { id: alert.id, lastSeenAt: alert.lastSeenAt, resolvedAt: alert.resolvedAt },
        data: { dirty: false, lastNotifiedAt: new Date(), nextAttemptAt: new Date(Date.now() + COOLDOWN_MS) },
      });
      result.sent++;
    } catch {
      result.failed++;
      await prisma.discordAlert.updateMany({ where: { id: alert.id }, data: { nextAttemptAt: new Date(Date.now() + 300_000) } });
      console.warn("[discord] envoi d’une alerte technique reporté ; consulter PM2.");
    }
  }
  return result;
}
