// Présence en ligne (pastille verte, « Déconnecté depuis… »). Logique pure : le serveur lit
// lastSeenAt, le battement du navigateur le rafraîchit tant que le joueur est là.

export type PresenceRow = { lastSeenAt: Date | null; appearOffline: boolean; role: string; isGuest: boolean };

/** Ce que la vue du profil reçoit : en ligne, ou depuis quand le joueur ne l'est plus. */
export type Presence = { online: true } | { online: false; lastSeenAt: Date | null };

/** L'équipe (ADMIN, DEV) peut se mettre hors ligne. */
export function isStaff(role: string): boolean {
  return role === "ADMIN" || role === "DEV";
}

/** Hors ligne choisi, seulement pour l'équipe : un ancien membre redevenu joueur réapparaît. */
export function hidesPresence(row: Pick<PresenceRow, "appearOffline" | "role">): boolean {
  return row.appearOffline && isStaff(row.role);
}

/** Vu depuis moins de `onlineSeconds`, sans être un invité ni en hors ligne choisi. */
export function isOnline(row: PresenceRow, now: Date, onlineSeconds: number): boolean {
  if (row.isGuest || hidesPresence(row) || !row.lastSeenAt) return false;
  return now.getTime() - row.lastSeenAt.getTime() < onlineSeconds * 1000;
}

export function presenceOf(row: PresenceRow, now: Date, onlineSeconds: number): Presence {
  return isOnline(row, now, onlineSeconds) ? { online: true } : { online: false, lastSeenAt: row.lastSeenAt };
}

/** Durée hors ligne dans l'unité la plus parlante : minutes (au moins 1), puis heures, puis jours. */
export function offlineFor(lastSeenAt: Date, now: Date): { unit: "minutes" | "hours" | "days"; count: number } {
  const minutes = Math.max(1, Math.floor((now.getTime() - lastSeenAt.getTime()) / 60_000));
  if (minutes < 60) return { unit: "minutes", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}

/** Passage plus récent que ce seuil (un demi-battement) : lastSeenAt n'est pas réécrit. */
export function touchThreshold(now: Date, heartbeatSeconds: number): Date {
  return new Date(now.getTime() - (heartbeatSeconds * 1000) / 2);
}

/** Faut-il écrire lastSeenAt ? */
export function shouldTouch(lastSeenAt: Date | null, now: Date, heartbeatSeconds: number): boolean {
  return !lastSeenAt || lastSeenAt < touchThreshold(now, heartbeatSeconds);
}
