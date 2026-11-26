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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Valeur JSON aux clés d'objet triées : la base (jsonb) ne garde pas leur ordre, un conflit ne doit pas en dépendre
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((k) => [k, canonical(record[k])]));
}

/** Même valeur de réglage, quel que soit l'ordre des clés d'objet. */
export function sameSettingValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/*
 * Enregistrement d'un formulaire de réglages. Le formulaire envoie son brouillon complet et, pour chaque clé, la
 * valeur en vigueur quand l'admin a commencé à la modifier à l'écran (`base`, en pratique celle de l'ouverture de la
 * page). Le serveur n'écrit que les clés où brouillon et base diffèrent, appliquées sur les valeurs relues en base :
 * une page restée ouverte ne rétablit jamais en silence ce qu'un autre membre de l'équipe (ou un script) a changé
 * ailleurs. Si une clé modifiée a elle-même changé en base depuis, l'enregistrement est refusé (STALE).
 */
export type SettingsSubmission<K extends SettingKey> = { base: SettingsOf<K>; draft: SettingsOf<K> };

/** Schéma d'un envoi : la base validée clé par clé, le brouillon par le schéma du formulaire (contrôles croisés compris). */
export function settingsSubmissionSchema<K extends SettingKey>(keys: readonly K[], draft: z.ZodType) {
  return z.object({ base: settingsSchemaFor(keys), draft }).strict();
}

/** Clés modifiées à l'écran et valeurs qui seraient en vigueur, ou clés modifiées entre-temps par quelqu'un d'autre. */
export type SettingsMerge<K extends SettingKey> =
  | { ok: true; edited: K[]; merged: SettingsOf<K> }
  | { ok: false; stale: K[] };

/**
 * Applique un envoi sur les valeurs en base (`stored`) : seules les clés modifiées à l'écran prennent la valeur du
 * brouillon, les autres gardent celle de la base même si elle diffère de ce que la page affichait. Conflit : une clé
 * modifiée dont la valeur en base n'est plus celle de départ, sauf si elle vaut déjà le brouillon (rien à écrire).
 */
export function mergeSettingsSubmission<K extends SettingKey>(
  keys: readonly K[],
  { base, draft }: SettingsSubmission<K>,
  stored: SettingsOf<K>,
): SettingsMerge<K> {
  const edited = changedSettingKeys(keys, base, draft);
  const stale = edited.filter((k) => !sameSettingValue(stored[k], base[k]) && !sameSettingValue(stored[k], draft[k]));
  if (stale.length > 0) return { ok: false, stale };
  const merged = { ...stored };
  for (const k of edited) merged[k] = draft[k];
  return { ok: true, edited, merged };
}

/*
 * Brouillon d'un formulaire de réglages (useSettingsDraft, components/admin/SettingsSaveBar.tsx). Chaque clé modifiée
 * à l'écran garde la valeur en vigueur quand sa modification a commencé (`from`), même si la page se rafraîchit
 * entre-temps : c'est la base envoyée au serveur. Les clés non modifiées suivent les valeurs en vigueur (`initial`,
 * relues à chaque rafraîchissement) : ce qu'un autre a changé s'affiche au lieu de passer pour une modification.
 */

/** Modification en cours d'un réglage à l'écran : valeur en vigueur quand elle a commencé, valeur voulue. */
export type SettingEdit = { from: unknown; to: unknown };
export type SettingEdits = Readonly<Record<string, SettingEdit>>;

// Modification encore en cours : celle dont la valeur voulue est désormais en vigueur s'efface
const pendingEdit = (edits: SettingEdits, initial: Record<string, unknown>, key: string): SettingEdit | undefined => {
  const edit: SettingEdit | undefined = edits[key];
  return edit && !same(edit.to, initial[key]) ? edit : undefined;
};

/** Brouillon et base d'un formulaire d'après les valeurs en vigueur et les modifications en cours. */
export function settingsDraftState<T extends Record<string, unknown>>(initial: T, edits: SettingEdits): { draft: T; base: T } {
  const draft: Record<string, unknown> = { ...initial };
  const base: Record<string, unknown> = { ...initial };
  for (const key of Object.keys(initial)) {
    const edit = pendingEdit(edits, initial, key);
    if (edit) {
      draft[key] = edit.to;
      base[key] = edit.from;
    }
  }
  return { draft: draft as T, base: base as T };
}

/**
 * Modifications après un changement du brouillon : une clé garde sa valeur de départ tant qu'elle reste modifiée,
 * et ne l'est plus quand elle revient à la valeur en vigueur.
 */
export function editSettingsDraft<T extends Record<string, unknown>>(initial: T, edits: SettingEdits, next: T): SettingEdits {
  const out: Record<string, SettingEdit> = {};
  for (const key of Object.keys(initial)) {
    if (same(next[key], initial[key])) continue;
    const edit = pendingEdit(edits, initial, key);
    out[key] = { from: edit ? edit.from : initial[key], to: next[key] };
  }
  return out;
}

/**
 * Après un enregistrement réussi de `sent` : chaque clé envoyée comme modifiée a désormais pour base la valeur
 * envoyée (plus rien à relire, sauf ce qui a été retouché pendant l'enregistrement), en attendant que la page
 * rafraîchie apporte les valeurs relues en base.
 */
export function commitSettingsEdits(edits: SettingEdits, sent: { base: Record<string, unknown>; draft: Record<string, unknown> }): SettingEdits {
  return Object.fromEntries(
    Object.entries(edits).map(([key, e]) => [key, same(sent.base[key], sent.draft[key]) ? e : { from: sent.draft[key], to: e.to }]),
  );
}

/**
 * Page rafraîchie après un enregistrement : ce qui a été enregistré reprend la valeur relue en base (le serveur a pu
 * la retoucher : révision des Nouveautés, seuils normalisés…) ; seules les modifications faites depuis restent.
 */
export function refreshedSettingsEdits(edits: SettingEdits): SettingEdits {
  return Object.fromEntries(Object.entries(edits).filter(([, e]) => !same(e.from, e.to)));
}
