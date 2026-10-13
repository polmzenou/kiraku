"use server";

import { updateTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { parseSetting } from "@/lib/settings/defaults";
import {
  BOOSTER_SETTING_KEYS,
  boosterSettingsSchema,
  changedKeys,
  type BoosterSettingKey,
  type BoosterSettings,
} from "@/lib/settings/booster-form";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { SETTINGS_TAG } from "../settings";

// Réglages des boosters depuis /admin. Ordre : rôle admin vérifié → Zod par clé → rate limit.
// Chaque clé modifiée écrit sa ligne GameSetting et une ligne AdminLog (avant / après).

export type UpdateSettingsResult =
  | { ok: true; changed: BoosterSettingKey[] }
  | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" };

export async function updateBoosterSettings(input: unknown): Promise<UpdateSettingsResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };

  const parsed = boosterSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const next = parsed.data as BoosterSettings;

  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const changed = await prisma.$transaction(async (tx) => {
    // Valeurs en vigueur lues en base (pas dans le cache) : l'avant du journal est exact
    const rows = await tx.gameSetting.findMany({
      where: { key: { in: [...BOOSTER_SETTING_KEYS] } },
      select: { key: true, value: true },
    });
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const before = Object.fromEntries(
      BOOSTER_SETTING_KEYS.map((k) => [k, parseSetting(k, stored.get(k))]),
    ) as BoosterSettings;

    const keys = changedKeys(before, next);
    for (const key of keys) {
      const value = next[key] as Prisma.InputJsonValue;
      await tx.gameSetting.upsert({
        where: { key },
        create: { key, value, updatedBy: admin.id },
        update: { value, updatedBy: admin.id },
      });
      await tx.adminLog.create({
        data: {
          adminId: admin.id,
          action: "SETTING_UPDATE",
          targetType: "GameSetting",
          targetId: key,
          before: before[key] as Prisma.InputJsonValue,
          after: value,
        },
      });
    }
    return keys;
  });

  // Effet immédiat dans tout le jeu, sans redéployer
  if (changed.length > 0) updateTag(SETTINGS_TAG);
  return { ok: true, changed };
}
