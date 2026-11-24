import { ENNICHI_SETTING_KEYS } from "@/lib/ennichi/rules";
import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/parrainage/ennichi (étape 18d) : toute l'équipe les modifie, ADMIN et DEV (canManageReferrals),
// comme ceux du parrainage v2. L'interrupteur est aussi sur /admin/fonctionnalites.

export const ENNICHI_FORM_KEYS = ENNICHI_SETTING_KEYS satisfies readonly SettingKey[];

export type EnnichiFormKey = (typeof ENNICHI_FORM_KEYS)[number];
export type EnnichiSettings = SettingsOf<EnnichiFormKey>;

export const ennichiSettingsSchema = settingsSchemaFor(ENNICHI_FORM_KEYS);
