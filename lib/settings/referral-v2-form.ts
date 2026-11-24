import { REFERRAL_V2_SETTING_KEYS } from "@/lib/referral/rules";
import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/parrainage/reglages (parrainage v2, étape 18) : toute l'équipe les modifie, ADMIN et DEV
// (canManageReferrals). L'interrupteur est aussi sur /admin/fonctionnalites.

export const REFERRAL_V2_FORM_KEYS = REFERRAL_V2_SETTING_KEYS satisfies readonly SettingKey[];

export type ReferralV2FormKey = (typeof REFERRAL_V2_FORM_KEYS)[number];
export type ReferralV2Settings = SettingsOf<ReferralV2FormKey>;

export const referralV2SettingsSchema = settingsSchemaFor(REFERRAL_V2_FORM_KEYS);
