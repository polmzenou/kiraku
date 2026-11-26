import type { SettingKey } from "./defaults";
import { settingsSchemaFor, type SettingsOf } from "./form";

// Réglages de /admin/casino : ouverture (date, badge « Nouveau », cérémonie), garde-fous et règles du pile ou face.
// L'interrupteur qui cache le casino (features.casino) reste dans /admin/fonctionnalites.

export const CASINO_FORM_KEYS = [
  "casino.opensAt",
  "casino.newBadgeDays",
  "casino.minAccountAgeHours",
  "casino.coinflip.enabled",
  "casino.coinflip.expiryHours",
  "casino.coinflip.maxOpenTables",
  "casino.coinflip.dailyLimit",
  "casino.coinflip.allowedRarities",
  "casino.coinflip.lastCopyAllowed",
  "casino.coinflip.lobbyPollSeconds",
  "casino.coinflip.tablePollSeconds",
  "casino.coinflip.feedSize",
  "casino.coinflip.feedMaxAgeHours",
  "casino.coinflip.feedBigFrom",
] as const satisfies readonly SettingKey[];

export type CasinoFormKey = (typeof CASINO_FORM_KEYS)[number];
export type CasinoSettings = SettingsOf<CasinoFormKey>;

// Au moins une rareté jouable : sinon le jeu est ouvert mais personne ne peut rien poser (couper le jeu
// passe par l'interrupteur)
export const casinoSettingsSchema = settingsSchemaFor(CASINO_FORM_KEYS).refine((s) => s["casino.coinflip.allowedRarities"].length > 0, {
  message: "Au moins une rareté jouable",
});
