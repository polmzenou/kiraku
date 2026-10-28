import "server-only";
import { unstable_cache } from "next/cache";
import { DEFAULT_HOURS_PER_PLAYER, DEFAULT_OTHER_PER_DAY, monthlyProjection } from "@/lib/usage/estimate";
import { estimateEgressGb, quotaAlerts, usageShare, type QuotaMeasure } from "@/lib/usage/quota";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { averageDailyPlayers, currentPollSettings } from "./usage";

// Consommation réelle de Supabase, lue en SQL (taille, tables, connexions, stockage). L'egress ne se
// lit pas en SQL et l'API Management n'en expose rien : il est estimé et affiché comme tel.
// Tout est tolérant : une mesure qui échoue ou traîne vaut null (« indisponible »), jamais une erreur.

export const USAGE_TAG = "usage";
const MEASURE_TIMEOUT_MS = 3_000;

/** Résultat de `run`, ou null s'il lève ou dépasse le délai (détail dans les logs seulement). */
export async function measure<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
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

export type SupabaseMeasures = {
  dbBytes: number | null;
  connections: { open: number; max: number } | null;
  storageBytes: number | null;
  /** Joueurs actifs par jour (7 derniers jours), base de l'estimation d'egress et du budget Vercel. */
  dailyPlayers: number | null;
  measuredAt: string;
};

export async function measureSupabase(): Promise<SupabaseMeasures> {
  const [dbBytes, connections, storageBytes, dailyPlayers] = await Promise.all([
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
    // Images sur Vercel Blob : le stockage Supabase reste sans doute proche de 0. Sans schéma
    // « storage » (base hors Supabase), la mesure vaut « indisponible ».
    measure("stockage", async () => {
      const [row] = await prisma.$queryRaw<{ bytes: bigint | null }[]>`
        SELECT coalesce(sum((metadata->>'size')::bigint), 0) AS bytes FROM storage.objects`;
      return Number(row.bytes ?? 0);
    }),
    measure("joueurs actifs", () => averageDailyPlayers()),
  ]);
  return { dbBytes, connections, storageBytes, dailyPlayers, measuredAt: new Date().toISOString() };
}

/** Les 8 tables les plus lourdes du schéma public (index et TOAST compris), ou null. */
export function heaviestTables(limit = 8) {
  return measure("tables les plus lourdes", async () => {
    const rows = await prisma.$queryRaw<{ name: string; bytes: bigint }[]>`
      SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) }));
  });
}

// Mesures partagées 5 min : le bandeau de chaque page /admin ne relance pas les requêtes
const cachedMeasures = unstable_cache(measureSupabase, ["supabase-usage-v1"], { revalidate: 300, tags: [USAGE_TAG] });

export type UsageKey = "database" | "connections" | "storage" | "egress" | "invocations" | "cpu" | "transfer";

export type UsageSnapshot = {
  measures: SupabaseMeasures;
  egressGb: number | null;
  vercel: { invocations: number; cpuHours: number; transferGb: number } | null;
  shares: QuotaMeasure<UsageKey>[];
};

/** Mesures (en cache) rapportées aux limites et au budget en vigueur, pour le bandeau et /admin/general. */
export async function usageSnapshot(): Promise<UsageSnapshot> {
  const [measures, limits, budget, kb, poll] = await Promise.all([
    cachedMeasures().catch(() => measureSupabase()),
    getSetting("usage.supabaseLimits"),
    getSetting("usage.vercelBudget"),
    getSetting("usage.egressKbPerInvocation"),
    currentPollSettings(),
  ]);
  const projection =
    measures.dailyPlayers === null
      ? null
      : monthlyProjection({
          settings: poll,
          dailyPlayers: measures.dailyPlayers,
          hoursPerPlayer: DEFAULT_HOURS_PER_PLAYER,
          otherPerDay: DEFAULT_OTHER_PER_DAY,
          budget,
        });
  const egressGb = projection ? estimateEgressGb(projection.invocations, kb) : null;
  const shares: QuotaMeasure<UsageKey>[] = [
    { key: "database", share: usageShare(measures.dbBytes, limits.dbSizeMb * 1_000_000) },
    { key: "connections", share: measures.connections ? usageShare(measures.connections.open, measures.connections.max) : null },
    { key: "storage", share: usageShare(measures.storageBytes, limits.storageGb * 1_000_000_000) },
    { key: "egress", share: usageShare(egressGb, limits.egressGb) },
    { key: "invocations", share: projection?.share.invocations ?? null },
    { key: "cpu", share: projection?.share.cpuHours ?? null },
    { key: "transfer", share: projection?.share.transferGb ?? null },
  ];
  return {
    measures,
    egressGb,
    vercel: projection ? { invocations: projection.invocations, cpuHours: projection.cpuHours, transferGb: projection.transferGb } : null,
    shares,
  };
}

/** Alertes du bandeau de /admin, ou null si la mesure elle-même a échoué. */
export async function usageAlerts() {
  try {
    const [snapshot, thresholds] = await Promise.all([usageSnapshot(), getSetting("usage.alertThresholds")]);
    return quotaAlerts(snapshot.shares, thresholds);
  } catch (e) {
    console.error("[usage] alertes indisponibles", e instanceof Error ? e.message : e);
    return null;
  }
}
