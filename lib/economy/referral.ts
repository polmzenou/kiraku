// Parrainage : règles anti-fraude pures. referral-core.ts les applique sous verrou ; la page
// /parrainage s'en sert pour afficher où en est chaque filleul.

/** 8 caractères sans 0/O/1/I (même alphabet que la fonction SQL kiraku_referral_code). */
export const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/** Code saisi ou reçu par lien → forme canonique, ou null s'il ne peut pas exister. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export type ReferralRules = {
  enabled: boolean;
  /** Le code ne se rattache que pendant ces jours après la création du compte. */
  attachWindowDays: number;
  /** Filleuls rattachés au plus par parrain sur 30 jours glissants. */
  maxPerMonth: number;
  minAccountAgeHours: number;
  minBoostersOpened: number;
  /** E-mail vérifié ou Discord lié. */
  requireVerified: boolean;
};

export type AttachPlayer = { id: string; isGuest: boolean; bannedAt: Date | null; createdAt: Date };

export type AttachCheck = {
  referee: AttachPlayer;
  referrer: AttachPlayer;
  /** Le filleul a déjà un parrain (une seule fois, définitivement). */
  alreadyReferred: boolean;
  /** Le parrain est lui-même le filleul de ce joueur (pas de cycle A ↔ B). */
  reverse: boolean;
  /** Blocage dans un sens ou dans l'autre. */
  blocked: boolean;
  /** Filleuls déjà rattachés au parrain sur les 30 derniers jours. */
  referrerRecent: number;
  now: Date;
  rules: ReferralRules;
};

export type AttachRefusal =
  | "DISABLED"
  | "SELF"
  | "GUEST"
  | "ALREADY_REFERRED"
  | "TOO_LATE"
  | "INVALID_CODE"
  | "REFERRER_FULL";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Première règle enfreinte, ou null. Un parrain invité, banni, bloqué ou en cycle répond comme un
 * code inconnu : on ne révèle rien du compte qui se cache derrière un code.
 */
export function checkAttach(c: AttachCheck): AttachRefusal | null {
  if (!c.rules.enabled) return "DISABLED";
  if (c.referee.id === c.referrer.id) return "SELF";
  if (c.referee.isGuest) return "GUEST";
  if (c.alreadyReferred) return "ALREADY_REFERRED";
  if (c.now.getTime() - c.referee.createdAt.getTime() > c.rules.attachWindowDays * DAY) return "TOO_LATE";
  if (c.referrer.isGuest || c.referrer.bannedAt || c.blocked || c.reverse) return "INVALID_CODE";
  if (c.referrerRecent >= c.rules.maxPerMonth) return "REFERRER_FULL";
  return null;
}

export type RefereeProgress = {
  isGuest: boolean;
  bannedAt: Date | null;
  createdAt: Date;
  verified: boolean;
  boostersOpened: number;
};

export type QualificationStep = "ACCOUNT" | "VERIFIED" | "AGE" | "BOOSTERS";

/** Étapes encore à franchir par le filleul (vide = qualifié). Un filleul banni ne se qualifie jamais. */
export function missingSteps(p: RefereeProgress, rules: ReferralRules, now: Date): QualificationStep[] {
  const missing: QualificationStep[] = [];
  if (p.isGuest || p.bannedAt) missing.push("ACCOUNT");
  if (rules.requireVerified && !p.verified) missing.push("VERIFIED");
  if (now.getTime() - p.createdAt.getTime() < rules.minAccountAgeHours * HOUR) missing.push("AGE");
  if (p.boostersOpened < rules.minBoostersOpened) missing.push("BOOSTERS");
  return missing;
}

export function isQualified(p: RefereeProgress, rules: ReferralRules, now: Date): boolean {
  return missingSteps(p, rules, now).length === 0;
}

export const REFERRAL_WINDOW_MS = 30 * DAY;

/** Palier : un lot réclamable une fois ce nombre d'amis qualifiés atteint (referral.milestones). */
export type ReferralMilestone = { referrals: number; lotId: string };

/** CLAIMED : réclamé · READY : atteint, à réclamer · NEXT : le prochain à atteindre · LOCKED : plus loin. */
export type MilestoneState = "CLAIMED" | "READY" | "NEXT" | "LOCKED";

export type MilestoneView = ReferralMilestone & { state: MilestoneState; remaining: number };

/** État de chaque palier (seuils croissants) pour `qualified` amis qualifiés depuis toujours. */
export function milestoneStates(
  milestones: readonly ReferralMilestone[],
  qualified: number,
  claimed: ReadonlySet<number>,
): MilestoneView[] {
  let nextFound = false;
  return milestones.map((m) => {
    const remaining = Math.max(0, m.referrals - qualified);
    let state: MilestoneState;
    if (remaining === 0) state = claimed.has(m.referrals) ? "CLAIMED" : "READY";
    else if (!nextFound) {
      state = "NEXT";
      nextFound = true;
    } else state = "LOCKED";
    return { ...m, state, remaining };
  });
}
