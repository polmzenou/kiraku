// Valeurs relevées contre les multi-comptes (server/anticheat/signals.ts) : formes acceptées avant d'écrire en base.

/** Identifiant d'appareil du cookie : 32 caractères hexadécimaux (16 octets aléatoires). */
export function isDeviceId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}

/** IP à relever : IPv4 ou IPv6 plausible, jamais « local » (dev) ni une valeur trop longue. */
export function isRecordableIp(value: string): boolean {
  if (value.length > 64) return false;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || (/^[0-9a-fA-F:.]+$/.test(value) && value.includes(":"));
}
