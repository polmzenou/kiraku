import "server-only";
import { statfs, readFile } from "node:fs/promises";
import os from "node:os";
import { unstable_cache } from "next/cache";
import { hostShares, parseMemAvailable, type HostKey, type HostMeasures } from "@/lib/usage/host";
import { quotaAlerts, type QuotaMeasure } from "@/lib/usage/quota";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Consommation du serveur qui fait tourner l'app (VPS : Next sous PM2, Postgres dans Docker sur la
// même machine). Lue par Node lui-même, sans dépendance ni accès SSH. Tout est tolérant : une
// mesure qui échoue ou traîne vaut null (« indisponible »), jamais une erreur.

const MEASURE_TIMEOUT_MS = 3_000;

/** Résultat de `run`, ou null s'il lève ou dépasse le délai (détail dans les logs seulement). */
export async function measure<T>(label: string, run: () => T | Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), MEASURE_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    console.error(`[usage] mesure ${label} indisponible`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function measureLoad(): HostMeasures["load"] {
  // Windows (dev) n'a pas de charge moyenne : os.loadavg() y renvoie [0, 0, 0]
  if (process.platform === "win32") return null;
  const [one, five, fifteen] = os.loadavg();
  return { one, five, fifteen, cores: os.availableParallelism() };
}

async function measureMemory(): Promise<HostMeasures["memory"]> {
  const meminfo = process.platform === "linux" ? await readFile("/proc/meminfo", "utf8").catch(() => "") : "";
  return { totalBytes: os.totalmem(), availableBytes: parseMemAvailable(meminfo) ?? os.freemem() };
}

async function measureDisk(): Promise<HostMeasures["disk"]> {
  const fs = await statfs(process.platform === "win32" ? process.cwd() : "/");
  return { totalBytes: fs.blocks * fs.bsize, freeBytes: fs.bavail * fs.bsize };
}

export type DatabaseMeasures = {
  bytes: number | null;
  connections: { open: number; max: number } | null;
  tables: { name: string; bytes: number }[] | null;
};

async function measureDatabase(): Promise<DatabaseMeasures> {
  const [bytes, connections, tables] = await Promise.all([
    measure("taille de la base", async () => {
      const [row] = await prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`;
      return Number(row.bytes);
    }),
    measure("connexions", async () => {
      const [row] = await prisma.$queryRaw<{ open: bigint; max: number }[]>`
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS open,
          current_setting('max_connections')::int AS max`;
      return { open: Number(row.open), max: Number(row.max) };
    }),
    measure("tables les plus lourdes", async () => {
      const rows = await prisma.$queryRaw<{ name: string; bytes: bigint }[]>`
        SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 8`;
      return rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) }));
    }),
  ]);
  return { bytes, connections, tables };
}

// Requêtes SQL partagées 1 min : le bandeau de chaque page /admin ne les relance pas. Les mesures
// système, elles, ne coûtent rien et restent instantanées.
const cachedDatabase = unstable_cache(measureDatabase, ["host-usage-db-v1"], { revalidate: 60 });

export type HostSnapshot = {
  measures: HostMeasures;
  database: DatabaseMeasures;
  /** Mémoire occupée par le processus Next (RSS). */
  appBytes: number;
  uptime: { host: number; app: number };
  shares: QuotaMeasure<HostKey>[];
  measuredAt: string;
};

/** Mesures du serveur et de sa base, rapportées à leur capacité, pour le bandeau et /admin/general. */
export async function hostSnapshot(): Promise<HostSnapshot> {
  const [load, memory, disk, database] = await Promise.all([
    measure("charge", measureLoad),
    measure("mémoire", measureMemory),
    measure("disque", measureDisk),
    cachedDatabase().catch(() => measureDatabase()),
  ]);
  const measures: HostMeasures = { load, memory, disk, connections: database.connections };
  return {
    measures,
    database,
    appBytes: process.memoryUsage().rss,
    uptime: { host: os.uptime(), app: process.uptime() },
    shares: hostShares(measures),
    measuredAt: new Date().toISOString(),
  };
}

/** Alertes du bandeau de /admin, ou null si la mesure elle-même a échoué. */
export async function usageAlerts() {
  try {
    const [snapshot, thresholds] = await Promise.all([hostSnapshot(), getSetting("usage.alertThresholds")]);
    return quotaAlerts(snapshot.shares, thresholds);
  } catch (e) {
    console.error("[usage] alertes indisponibles", e instanceof Error ? e.message : e);
    return null;
  }
}
