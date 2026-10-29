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

// Mémo du processus : la table lue sert 2 s. Une vue de l'accueil lit environ 80 réglages, un sondage
// de combat une trentaine ; sans lui, chaque lecture repassait par le cache de Next (clé hachée, table
// relue en JSON). Une sauvegarde de l'admin l'oublie aussitôt : forgetSettings() suit chaque
// updateTag(SETTINGS_TAG).
const MEMO_MS = 2_000;
let memo: { at: number; all: ReturnType<typeof loadSettings> } | null = null;

function settingsTable(): ReturnType<typeof loadSettings> {
  const now = Date.now();
  if (memo && now - memo.at < MEMO_MS) return memo.all;
  const entry = { at: now, all: loadSettings() };
  memo = entry;
  // Lecture en échec : ne pas la resservir pendant 2 s
  entry.all.catch(() => {
    if (memo === entry) memo = null;
  });
  return entry.all;
}

/** Oublie la table mémorisée par ce processus ; à appeler avec chaque updateTag(SETTINGS_TAG). */
export function forgetSettings(): void {
  memo = null;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const all = await settingsTable();
  return parseSetting(key, all[key]);
}
