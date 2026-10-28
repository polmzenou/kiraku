import { usageShare, type QuotaMeasure } from "./quota";

// Consommation du serveur (VPS) rapportée à sa capacité : logique pure, les mesures arrivent de
// server/admin/host-usage.ts. Une mesure absente (null) n'alerte jamais.

export type HostKey = "cpu" | "memory" | "disk" | "connections";

export type HostMeasures = {
  /** Charge moyenne sur 1, 5 et 15 minutes, et nombre de cœurs. */
  load: { one: number; five: number; fifteen: number; cores: number } | null;
  memory: { totalBytes: number; availableBytes: number } | null;
  disk: { totalBytes: number; freeBytes: number } | null;
  connections: { open: number; max: number } | null;
};

/**
 * Mémoire disponible (champ MemAvailable de /proc/meminfo, en octets), ou null. Contrairement à
 * MemFree, elle compte le cache disque que Linux rend dès qu'une application en a besoin.
 */
export function parseMemAvailable(meminfo: string): number | null {
  const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(meminfo);
  return match ? Number(match[1]) * 1024 : null;
}

/** Part de capacité utilisée par mesure. Charge : moyenne sur 5 min, pour ignorer un pic bref (build). */
export function hostShares(m: HostMeasures): QuotaMeasure<HostKey>[] {
  return [
    { key: "cpu", share: m.load ? usageShare(m.load.five, m.load.cores) : null },
    { key: "memory", share: m.memory ? usageShare(m.memory.totalBytes - m.memory.availableBytes, m.memory.totalBytes) : null },
    { key: "disk", share: m.disk ? usageShare(m.disk.totalBytes - m.disk.freeBytes, m.disk.totalBytes) : null },
    { key: "connections", share: m.connections ? usageShare(m.connections.open, m.connections.max) : null },
  ];
}
