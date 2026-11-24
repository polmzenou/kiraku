import { REFERRAL_CODE_PATTERN } from "@/lib/economy/referral";

// Codes d'invitation du parrainage v2 : le code standard de chaque compte (8 caractères, alphabet sans 0/O/1/I) et le
// code perso posé par l'équipe (/i/TRISTREN). Les deux espaces sont disjoints : un code perso qui pourrait être un code
// standard est refusé, donc un code saisi ne désigne jamais deux comptes. Le même motif est vérifié par un CHECK en base.

/** Code perso : 4 à 16 lettres ou chiffres, en majuscules. */
export const VANITY_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

export type InviteCode = { kind: "STANDARD"; code: string } | { kind: "VANITY"; code: string };

const MAX_RAW_LENGTH = 40;

/** Forme canonique d'un code saisi ou reçu par lien : majuscules, sans espaces ni tirets. */
function canonical(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Code saisi ou reçu par lien → code standard ou code perso, ou null s'il ne peut pas exister. */
export function parseInviteCode(raw: unknown): InviteCode | null {
  if (typeof raw !== "string" || raw.length > MAX_RAW_LENGTH) return null;
  const code = canonical(raw);
  if (REFERRAL_CODE_PATTERN.test(code)) return { kind: "STANDARD", code };
  if (VANITY_CODE_PATTERN.test(code)) return { kind: "VANITY", code };
  return null;
}

export type VanityRefusal = "FORMAT" | "STANDARD_SHAPE";

/** Code perso proposé par l'équipe → forme canonique, ou la raison du refus. */
export function checkVanityCode(raw: string): { ok: true; code: string } | { ok: false; reason: VanityRefusal } {
  const code = canonical(raw);
  if (!VANITY_CODE_PATTERN.test(code)) return { ok: false, reason: "FORMAT" };
  if (REFERRAL_CODE_PATTERN.test(code)) return { ok: false, reason: "STANDARD_SHAPE" };
  return { ok: true, code };
}
