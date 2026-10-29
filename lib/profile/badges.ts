// Bio et badges du profil, sans Zod : l'en-tête (chat, fiche de profil) les importe sur toutes les pages,
// alors que les schémas des conditions de lib/profile/conditions.ts tiraient Zod dans le bundle commun.

/** Longueur maximale de la bio (colonne User.bio). */
export const BIO_MAX = 160;

// --- Badges (dérivés, sans table) ---

// AMBASSADOR vient du rôle donné par l'admin ; SPONSOR (Parrain) et RECRUITER (Recruteur) des filleuls qualifiés
export const BADGES = ["PIONEER", "AMBASSADOR", "SPONSOR", "RECRUITER", "VERIFIED"] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_KANJI: Record<Badge, string> = { PIONEER: "先", AMBASSADOR: "使", SPONSOR: "縁", RECRUITER: "募", VERIFIED: "認" };

/** Pastille du badge : l'or par défaut, le vert hisui pour le rôle Ambassadeur. */
export const BADGE_CLASS: Record<Badge, { pill: string; kanji: string }> = {
  PIONEER: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  AMBASSADOR: { pill: "border-hisui/60 text-hisui", kanji: "text-hisui" },
  SPONSOR: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  RECRUITER: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  VERIFIED: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
};

export function earnedBadges(input: {
  createdAt: Date;
  pioneerUntil: Date | null;
  ambassador: boolean;
  qualifiedReferrals: number;
  sponsorReferrals: number;
  recruiterReferrals: number;
  discordLinked: boolean;
}): Badge[] {
  const out: Badge[] = [];
  if (input.pioneerUntil && input.createdAt <= input.pioneerUntil) out.push("PIONEER");
  if (input.ambassador) out.push("AMBASSADOR");
  if (input.sponsorReferrals > 0 && input.qualifiedReferrals >= input.sponsorReferrals) out.push("SPONSOR");
  if (input.recruiterReferrals > 0 && input.qualifiedReferrals >= input.recruiterReferrals) out.push("RECRUITER");
  if (input.discordLinked) out.push("VERIFIED");
  return out;
}

/** Badges affichés, dans l'ordre choisi par le joueur ; aucun choix = tous, dans l'ordre par défaut. */
export function orderedBadges(earned: readonly Badge[], order: readonly string[]): Badge[] {
  const chosen = order.filter((b): b is Badge => (earned as readonly string[]).includes(b));
  return chosen.length > 0 ? [...new Set(chosen)] : [...earned];
}
