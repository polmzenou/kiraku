import "server-only";
import { REFERRAL_V2_SETTING_KEYS, referralV2RulesFrom, type ReferralV2Rules } from "@/lib/referral/rules";
import type { SettingValue } from "@/lib/settings/defaults";
import { lotDeps } from "../economy/deps";
import { env } from "../env";
import { pushNotifications } from "../push/send";
import { getSetting } from "../settings";
import { fingerprintKey } from "./fingerprint";
import type { ProgressDeps } from "./progress-core";

// Dépendances serveur du parrainage v2 : règles lues dans GameSetting, clé des empreintes dérivée d'AUTH_SECRET,
// versement des lots, Web Push après la transaction. Les cœurs (server/referral/*-core.ts) les reçoivent injectées.

export async function referralV2Rules(): Promise<ReferralV2Rules> {
  const values = await Promise.all(REFERRAL_V2_SETTING_KEYS.map((key) => getSetting(key)));
  const byKey = new Map<string, unknown>(REFERRAL_V2_SETTING_KEYS.map((key, i) => [key, values[i]]));
  return referralV2RulesFrom((key) => byKey.get(key) as SettingValue<typeof key>);
}

let key: Buffer | null = null;

/** Clé des empreintes des filleuls (jamais le secret lui-même). */
export function referralFingerprintKey(): Buffer {
  key ??= fingerprintKey(env.AUTH_SECRET);
  return key;
}

export async function progressDeps(now = new Date()): Promise<ProgressDeps> {
  const [rules, timeZone, sharedCap, scoring, ennichiMultiplier] = await Promise.all([
    referralV2Rules(),
    getSetting("game.timeZone"),
    getSetting("multiAccount.sharedIpCap"),
    getSetting("multiAccount.scoring"),
    getSetting("ennichi.stepMultiplier"),
  ]);
  // Multiplicateur de l'Ennichi : appliqué aux étapes 1 et 2 des seuls amis arrivés pendant une fête (ennichiEdition)
  return { rules, now, timeZone, sharedCap, scoring, ennichiMultiplier, lotDeps: lotDeps(), onNotified: (ids) => void pushNotifications(ids) };
}
