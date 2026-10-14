import type { SettingKey } from "./defaults";
import { changedSettingKeys, settingsSchemaFor, type SettingsOf } from "./form";

// Réglages du panneau /admin/collection : recyclage des doublons et vitrine du profil.

export const COLLECTION_SETTING_KEYS = [
  "collection.recycleValues",
  "showcase.slots",
] as const satisfies readonly SettingKey[];

export type CollectionSettingKey = (typeof COLLECTION_SETTING_KEYS)[number];

export type CollectionSettings = SettingsOf<CollectionSettingKey>;

export const collectionSettingsSchema = settingsSchemaFor(COLLECTION_SETTING_KEYS);

export function changedCollectionKeys(before: CollectionSettings, after: CollectionSettings): CollectionSettingKey[] {
  return changedSettingKeys(COLLECTION_SETTING_KEYS, before, after);
}
