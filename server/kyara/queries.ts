import "server-only";
import { cache } from "react";
import { KYARA_SETTING_KEYS, kyaraRulesFrom, type KyaraRules } from "@/lib/kyara/rules";
import type { SettingValue } from "@/lib/settings/defaults";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Lectures de l'import Kyara (pages du joueur et de l'équipe). Les écritures sont dans import-core.ts.

export const getKyaraRules = cache(async (): Promise<KyaraRules> => {
  const values = await Promise.all(KYARA_SETTING_KEYS.map((key) => getSetting(key)));
  const byKey = new Map<string, unknown>(KYARA_SETTING_KEYS.map((key, i) => [key, values[i]]));
  return kyaraRulesFrom((key) => byKey.get(key) as SettingValue<typeof key>);
});

/** Tableau de bord de /admin/kyara : demandes par statut et plus ancienne demande en attente. */
export async function kyaraAdminOverview() {
  const [groups, oldest] = await Promise.all([
    prisma.kyaraImport.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.kyaraImport.findFirst({ where: { status: "PENDING" }, orderBy: { requestedAt: "asc" }, select: { requestedAt: true } }),
  ]);
  const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  return {
    pending: count("PENDING"),
    ready: count("READY"),
    done: count("DONE"),
    rejected: count("REJECTED"),
    cancelled: count("CANCELLED"),
    oldestPendingAt: oldest?.requestedAt ?? null,
  };
}
