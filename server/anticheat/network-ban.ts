import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isStaff } from "@/lib/admin/roles";
import { ipBanKey } from "@/lib/anticheat/network";
import { isDeviceId } from "@/lib/anticheat/signals";
import { prisma } from "../db";
import { clientIp, rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { findNetworkBans, followDeviceWith, type MatchedBan } from "./network-ban-core";
import { DEVICE_COOKIE } from "./signals";

// Bans réseau (NetworkBan) : une IP ou un appareil banni coupe tout l'accès, l'équipe exceptée.
// - Pages : AccountGate montre l'écran du ban à la place de la page (textes légaux et connexion restent lisibles).
// - Actions et routes : getCurrentUser traite le joueur comme banni (bannedAt), toutes les vérifications existantes
//   s'appliquent d'elles-mêmes.
// - Entrées sans session : ensureGuest, inscription et connexion e-mail, connexion Discord refusent explicitement.
// Un appareil banni qui revient avec une nouvelle IP la fait bannir à son tour (followDeviceWith).
// Écritures de l'admin et lectures : network-ban-core.ts.

/** Ce que la requête en cours a de banni : les bans trouvés, la clé de son IP et son appareil. */
export type RequestBan = { bans: MatchedBan[]; ipKey: string | null; device: string | null; since: Date };

/**
 * Ban réseau de la requête en cours (son IP, son cookie d'appareil), lu une fois par requête. null : rien de banni.
 * Le cookie n'est que lu ici : il est posé par le relevé des multi-comptes (server/anticheat/signals.ts).
 */
export const requestNetworkBan = cache(async (): Promise<RequestBan | null> => {
  const [ip, jar] = await Promise.all([clientIp(), cookies()]);
  const raw = jar.get(DEVICE_COOKIE.name)?.value;
  const target = { ipKey: ipBanKey(ip), device: isDeviceId(raw) ? raw : null };
  const bans = await findNetworkBans(prisma, target, new Date());
  if (bans.length === 0) return null;
  const since = new Date(Math.min(...bans.map((b) => b.createdAt.getTime())));
  return { bans, ...target, since };
});

/** Le ban de la requête coupe-t-il ce joueur ? Jamais un compte de l'équipe (ADMIN, DEV). */
export function blocks(ban: RequestBan | null, role: string | null | undefined): ban is RequestBan {
  return ban !== null && !isStaff(role);
}

/**
 * Accès refusé par un ban réseau : compte la tentative et, si un appareil banni arrive d'une IP qui ne l'est pas,
 * fait suivre le ban. Au plus une fois par 10 minutes pour un même réseau. Ne lève jamais : appelée après la
 * réponse (after()), un échec ne finit que dans les logs.
 */
export async function noteBlocked(ban: RequestBan): Promise<void> {
  try {
    const ids = ban.bans.map((b) => b.id).sort();
    const { success } = await rateLimit(`netban:${ids.join(",")}:${ban.ipKey ?? "-"}`, { limit: 1, windowSeconds: 600 }, { store: "memory" });
    if (!success) return;
    const now = new Date();
    await prisma.networkBan.updateMany({ where: { id: { in: ids } }, data: { hits: { increment: 1 }, lastHitAt: now } });
    const deviceBan = ban.bans.find((b) => b.kind === "DEVICE");
    if (!deviceBan || !ban.device || !ban.ipKey || ban.bans.some((b) => b.kind === "IP")) return;
    const [enabled, maxOthers, days, perDevice] = await Promise.all([
      getSetting("multiAccount.followDevice"),
      getSetting("multiAccount.autoBanMaxOthers"),
      getSetting("multiAccount.autoBanDays"),
      getSetting("multiAccount.autoBanPerDevice"),
    ]);
    await followDeviceWith(prisma, { deviceBan, device: ban.device, ipKey: ban.ipKey, now }, { enabled, maxOthers, days, perDevice });
  } catch (e) {
    console.error("[bans réseau] tentative", e instanceof Error ? e.message : e);
  }
}
