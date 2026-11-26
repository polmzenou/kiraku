import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { isStaff } from "@/lib/admin/roles";
import { BLOCKED_DEVICES_MAX, ipBanKey } from "@/lib/anticheat/network";
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
 * Une lecture qui échoue laisse passer (journalisée) : toutes les pages en dépendent, un incident sur la table des
 * bans (migration pas encore appliquée, base lente) ne doit pas fermer le site.
 */
export const requestNetworkBan = cache(async (): Promise<RequestBan | null> => {
  const [ip, jar] = await Promise.all([clientIp(), cookies()]);
  const raw = jar.get(DEVICE_COOKIE.name)?.value;
  const target = { ipKey: ipBanKey(ip), device: isDeviceId(raw) ? raw : null };
  let bans: MatchedBan[];
  try {
    bans = await findNetworkBans(prisma, target, new Date());
  } catch (e) {
    console.error("[bans réseau] lecture", e instanceof Error ? e.message : e);
    return null;
  }
  if (bans.length === 0) return null;
  const since = new Date(Math.min(...bans.map((b) => b.createdAt.getTime())));
  return { bans, ...target, since };
});

/**
 * Le ban de la requête s'il coupe ce joueur, sinon null : jamais un compte de l'équipe (ADMIN, DEV). Un null ne veut
 * donc pas dire « aucun ban » : un membre de l'équipe sur un réseau banni passe.
 */
export function blockingBan(ban: RequestBan | null, role: string | null | undefined): RequestBan | null {
  return ban !== null && !isStaff(role) ? ban : null;
}

/** Empreinte courte d'un appareil (sha-256 tronqué) : compter les appareils distincts sans garder leur cookie. */
const deviceTag = (device: string) => createHash("sha256").update(device).digest("hex").slice(0, 12);

/**
 * Bans d'IP de la requête : note l'appareil qu'ils bloquent, s'il n'est pas encore compté et qu'il est connu (cookie
 * relevé pour un compte, donc posé par le serveur : un cookie inventé ne compte pas et ne gonfle pas le total). Une
 * IP qui bloque plusieurs appareils coupe sans doute plusieurs foyers : la liste des bans le montre. Comparé aux
 * empreintes déjà chargées : une écriture par appareil nouveau, BLOCKED_DEVICES_MAX au plus par ban.
 */
async function noteDevice(ban: RequestBan): Promise<void> {
  if (!ban.device) return;
  const tag = deviceTag(ban.device);
  const ids = ban.bans.filter((b) => b.kind === "IP" && b.deviceTags.length < BLOCKED_DEVICES_MAX && !b.deviceTags.includes(tag)).map((b) => b.id);
  if (ids.length === 0) return;
  const known = await prisma.userSignal.findFirst({ where: { kind: "DEVICE", value: ban.device }, select: { id: true } });
  if (!known) return;
  await prisma.$executeRaw`
    UPDATE "NetworkBan" SET "deviceTags" = array_append(coalesce("deviceTags", ARRAY[]::text[]), ${tag})
    WHERE id = ANY(${ids}::text[])
      AND coalesce(cardinality("deviceTags"), 0) < ${BLOCKED_DEVICES_MAX}
      AND NOT (${tag} = ANY(coalesce("deviceTags", ARRAY[]::text[])))`;
}

/**
 * Accès refusé par un ban réseau : compte le passage et, si un appareil banni arrive d'une IP qui ne l'est pas,
 * fait suivre le ban. Passages et suivi : au plus une fois par 10 minutes pour un même réseau ; l'appareil bloqué
 * est noté à chaque fois (noteDevice). Ne lève jamais : appelée après la réponse (after()), un échec ne finit que
 * dans les logs.
 */
export async function noteBlocked(ban: RequestBan): Promise<void> {
  try {
    await noteDevice(ban);
    const ids = ban.bans.map((b) => b.id).sort();
    const { success } = await rateLimit(`netban:${ids.join(",")}:${ban.ipKey ?? "-"}`, { limit: 1, windowSeconds: 600 }, { store: "memory" });
    if (!success) return;
    const now = new Date();
    await prisma.networkBan.updateMany({ where: { id: { in: ids } }, data: { hits: { increment: 1 }, lastHitAt: now } });
    const deviceBan = ban.bans.find((b) => b.kind === "DEVICE");
    if (!deviceBan || !ban.device || !ban.ipKey || ban.bans.some((b) => b.kind === "IP")) return;
    const [enabled, ipv4, maxOthers, days, perDevice] = await Promise.all([
      getSetting("multiAccount.followDevice"),
      getSetting("multiAccount.followDeviceIpv4"),
      getSetting("multiAccount.autoBanMaxOthers"),
      getSetting("multiAccount.autoBanDays"),
      getSetting("multiAccount.autoBanPerDevice"),
    ]);
    await followDeviceWith(prisma, { deviceBan, device: ban.device, ipKey: ban.ipKey, now }, { enabled, ipv4, maxOthers, days, perDevice });
  } catch (e) {
    console.error("[bans réseau] tentative", e instanceof Error ? e.message : e);
  }
}
