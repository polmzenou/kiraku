import { SETTING_DEFAULTS, type SettingValue } from "@/lib/settings/defaults";

// Règles du parrainage v2 (étape 18), lues dans GameSetting (valeurs par défaut dans lib/settings/defaults.ts).

export const REFERRAL_V2_SETTING_KEYS = [
  "referral.v2.enabled",
  "referral.v2.maxPerMonth",
  "referral.v2.installHours",
  "referral.v2.installOpenings",
  "referral.v2.guestGraceHours",
  "referral.v2.accroDays",
  "referral.v2.accroWindowDays",
  "referral.v2.fideleDays",
  "referral.v2.fideleWindowDays",
  "referral.v2.stepLots",
  "referral.v2.grandLotId",
  "referral.v2.milestones",
  "referral.v2.trustDiscordDays",
  "referral.v2.holdScore",
  "referral.v2.scoreTtlHours",
  "referral.v2.cardLockDays",
  "referral.v2.pairLockDays",
] as const;

export type ReferralV2SettingKey = (typeof REFERRAL_V2_SETTING_KEYS)[number];

export type StepLots = SettingValue<"referral.v2.stepLots">;
export type ReferralMilestone = SettingValue<"referral.v2.milestones">[number];

export type ReferralV2Rules = {
  enabled: boolean;
  maxPerMonth: number;
  /** Étape 2 : heures depuis le rattachement et ouvertures hors cadeau. */
  installHours: number;
  installOpenings: number;
  /** Les ouvertures faites en invité jusqu'à ces heures avant le rattachement comptent pour l'étape 2. */
  guestGraceHours: number;
  /** Étapes 3 et 4 : jours actifs dans les premiers jours (jour du rattachement compris). */
  accroDays: number;
  accroWindowDays: number;
  fideleDays: number;
  fideleWindowDays: number;
  stepLots: StepLots;
  grandLotId: string | null;
  milestones: readonly ReferralMilestone[];
  /** Âge minimal du compte Discord, à sa liaison, pour une confiance haute. */
  trustDiscordDays: number;
  /** Score de la paire à partir duquel un parrainage passe « À vérifier ». */
  holdScore: number;
  scoreTtlHours: number;
  cardLockDays: number;
  pairLockDays: number;
};

export function referralV2RulesFrom(get: <K extends ReferralV2SettingKey>(key: K) => SettingValue<K>): ReferralV2Rules {
  // Une fenêtre ne peut pas demander plus de jours qu'elle n'en contient
  const accroWindowDays = get("referral.v2.accroWindowDays");
  const fideleWindowDays = get("referral.v2.fideleWindowDays");
  return {
    enabled: get("referral.v2.enabled"),
    maxPerMonth: get("referral.v2.maxPerMonth"),
    installHours: get("referral.v2.installHours"),
    installOpenings: get("referral.v2.installOpenings"),
    guestGraceHours: get("referral.v2.guestGraceHours"),
    accroDays: Math.min(get("referral.v2.accroDays"), accroWindowDays),
    accroWindowDays,
    fideleDays: Math.min(get("referral.v2.fideleDays"), fideleWindowDays),
    fideleWindowDays,
    stepLots: get("referral.v2.stepLots"),
    grandLotId: get("referral.v2.grandLotId"),
    milestones: get("referral.v2.milestones"),
    trustDiscordDays: get("referral.v2.trustDiscordDays"),
    holdScore: get("referral.v2.holdScore"),
    scoreTtlHours: get("referral.v2.scoreTtlHours"),
    cardLockDays: get("referral.v2.cardLockDays"),
    pairLockDays: get("referral.v2.pairLockDays"),
  };
}

export const DEFAULT_REFERRAL_V2_RULES: ReferralV2Rules = referralV2RulesFrom((key) => SETTING_DEFAULTS[key]);
