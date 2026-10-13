import "server-only";
import { unstable_cache } from "next/cache";
import { parseSetting, type SettingKey, type SettingValue } from "@/lib/settings/defaults";
import { prisma } from "./db";

export const SETTINGS_TAG = "settings";

// Toute la table est petite : on la lit d'un bloc et on la garde en cache.
// Une sauvegarde dans l'admin appellera revalidateTag(SETTINGS_TAG).
const loadSettings = unstable_cache(
  async () => {
    const rows = await prisma.gameSetting.findMany({ select: { key: true, value: true } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  ["game-settings"],
  { tags: [SETTINGS_TAG] },
);

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const all = await loadSettings();
  return parseSetting(key, all[key]);
}
