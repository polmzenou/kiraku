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

/** Réglages dont la valeur est un nombre. */
export type NumberSettingKey = { [K in SettingKey]: SettingValue<K> extends number ? K : never }[SettingKey];

/** Bornes [min, max] d'un réglage numérique, lues dans son schéma Zod : un formulaire ne les recopie jamais. */
export function numberBounds(key: NumberSettingKey): [number, number] {
  const schema = SETTING_SCHEMAS[key] as unknown as z.ZodNumber;
  return [schema.minValue ?? Number.MIN_SAFE_INTEGER, schema.maxValue ?? Number.MAX_SAFE_INTEGER];
}

/** Clés dont la valeur change (comparaison par valeur, ordre des clés d'objet compris). */
export function changedSettingKeys<K extends SettingKey>(
  keys: readonly K[],
  before: SettingsOf<K>,
  after: SettingsOf<K>,
): K[] {
  return keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}
