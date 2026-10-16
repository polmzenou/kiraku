import { z } from "@/lib/zod";
import { SETTING_SCHEMAS, type SettingKey, type SettingValue } from "./defaults";

// Outils communs aux formulaires de réglages de /admin : chaque clé garde son schéma Zod (defaults.ts).

export type SettingsOf<K extends SettingKey> = { [P in K]: SettingValue<P> };

/** Schéma d'un groupe de réglages, assemblé à partir des schémas de chaque clé. */
export function settingsSchemaFor<K extends SettingKey>(keys: readonly K[]) {
  return z.object(
    Object.fromEntries(keys.map((k) => [k, SETTING_SCHEMAS[k]])) as { [P in K]: (typeof SETTING_SCHEMAS)[P] },
  );
}

/** Clés dont la valeur change (comparaison par valeur, ordre des clés d'objet compris). */
export function changedSettingKeys<K extends SettingKey>(
  keys: readonly K[],
  before: SettingsOf<K>,
  after: SettingsOf<K>,
): K[] {
  return keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}
