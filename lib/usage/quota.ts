import { z } from "@/lib/zod";

// Niveau d'alerte d'une mesure de consommation face à sa limite (bandeau de /admin, barres de
// /admin/general). Logique pure : les mesures arrivent de server/admin/supabase-usage.ts.

export type QuotaLevel = "ok" | "warn" | "critical" | "unknown";

/** Seuils en pourcentage de la limite : orange à partir de warn, rouge à partir de critical. */
export const alertThresholdsSchema = z
  .object({ warnPercent: z.number().int().min(1).max(99), criticalPercent: z.number().int().min(2).max(100) })
  .refine((t) => t.criticalPercent > t.warnPercent, { message: "critical > warn" });

export type AlertThresholds = z.infer<typeof alertThresholdsSchema>;

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = { warnPercent: 70, criticalPercent: 90 };

/** Part de la limite consommée (1 = limite atteinte), ou null si la mesure ou la limite manque. */
export function usageShare(value: number | null | undefined, limit: number | null | undefined): number | null {
  if (value == null || limit == null || !Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, value) / limit;
}

export function quotaLevel(share: number | null, t: AlertThresholds): QuotaLevel {
  if (share == null || !Number.isFinite(share)) return "unknown";
  const percent = share * 100;
  if (percent >= t.criticalPercent) return "critical";
  if (percent >= t.warnPercent) return "warn";
  return "ok";
}

export type QuotaMeasure<K extends string = string> = { key: K; share: number | null };
export type QuotaAlert<K extends string = string> = { key: K; share: number; level: "warn" | "critical" };

/** Mesures au-dessus d'un seuil, la plus chargée d'abord, et le pire niveau (null si tout va bien). */
export function quotaAlerts<K extends string>(measures: readonly QuotaMeasure<K>[], t: AlertThresholds) {
  const alerts: QuotaAlert<K>[] = [];
  for (const m of measures) {
    const level = quotaLevel(m.share, t);
    if (level === "warn" || level === "critical") alerts.push({ key: m.key, share: m.share!, level });
  }
  alerts.sort((a, b) => b.share - a.share);
  const worst = alerts.some((a) => a.level === "critical") ? "critical" : alerts.length > 0 ? "warn" : null;
  return { worst, alerts } as const;
}

/** Egress estimé (Go sur 30 jours) : invocations projetées × octets lus en base par invocation. */
export function estimateEgressGb(monthlyInvocations: number, kbPerInvocation: number): number {
  return (Math.max(0, monthlyInvocations) * Math.max(0, kbPerInvocation)) / 1_000_000;
}

/** Limites du plan Supabase (gratuit par défaut, vérifiées dans la doc officielle le 28/10/2026). */
export const supabaseLimitsSchema = z.object({
  dbSizeMb: z.number().int().min(1).max(10_000_000),
  egressGb: z.number().int().min(1).max(1_000_000),
  storageGb: z.number().int().min(1).max(1_000_000),
  poolerClients: z.number().int().min(1).max(1_000_000),
});
export type SupabaseLimits = z.infer<typeof supabaseLimitsSchema>;

// supabase.com/pricing (Free) et docs « Compute and disk » (Nano : 60 connexions directes, 200 clients du pooler)
export const SUPABASE_FREE_LIMITS: SupabaseLimits = { dbSizeMb: 500, egressGb: 5, storageGb: 1, poolerClients: 200 };
