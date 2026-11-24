// Bio et badges du profil, sans Zod : l'en-tête (chat, fiche de profil) les importe sur toutes les pages,
// alors que les schémas des conditions de lib/profile/conditions.ts tiraient Zod dans le bundle commun.

/** Longueur maximale de la bio (colonne User.bio). */
export const BIO_MAX = 160;

// --- Badges (dérivés, sans table) ---

// DEV vient du rôle d'équipe (DEV ou ADMIN), AMBASSADOR du rôle donné par l'admin ; SPONSOR (Parrain) et RECRUITER (Recruteur) des filleuls qualifiés ;
// REBORN (prestige 1 ou plus), CONSECRATOR (une carte au sanctuaire) et ENGRAVER (une édition gravée possédée) du prestige
export const BADGES = ["DEV", "PIONEER", "AMBASSADOR", "SPONSOR", "RECRUITER", "VERIFIED", "REBORN", "CONSECRATOR", "ENGRAVER"] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_KANJI: Record<Badge, string> = {
  DEV: "匠",
  PIONEER: "先",
  AMBASSADOR: "使",
  SPONSOR: "縁",
  RECRUITER: "募",
  VERIFIED: "認",
  REBORN: "転",
  CONSECRATOR: "奉",
  ENGRAVER: "版",
};

/** Pastille du badge : l'or par défaut, l'indigo ai pour l'équipe, le vert hisui pour le rôle Ambassadeur. */
export const BADGE_CLASS: Record<Badge, { pill: string; kanji: string }> = {
  DEV: { pill: "border-ai/60 text-ai", kanji: "text-ai" },
  PIONEER: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  AMBASSADOR: { pill: "border-hisui/60 text-hisui", kanji: "text-hisui" },
  SPONSOR: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  RECRUITER: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  VERIFIED: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  REBORN: { pill: "border-kin/70 text-kin", kanji: "text-kin" },
  CONSECRATOR: { pill: "border-kin/70 text-kin", kanji: "text-kin" },
  ENGRAVER: { pill: "border-shu/60 text-shu", kanji: "text-shu" },
};

export function earnedBadges(input: {
  createdAt: Date;
  pioneerUntil: Date | null;
  /** Membre de l'équipe (rôle DEV ou ADMIN). */
  staff: boolean;
  ambassador: boolean;
  /** Amis installés (étape 2 du parrainage, v1 qualifiés compris). */
  installedReferrals: number;
  sponsorReferrals: number;
  recruiterReferrals: number;
  discordLinked: boolean;
  /**
   * Prestige : niveau atteint, cartes au sanctuaire, éditions gravées possédées (sanctuaire compris, ou le meilleur
   * d'un cycle passé : une gravée recyclée à une renaissance laisse le badge acquis) ; absents : 0.
   */
  prestige?: number;
  consecrated?: number;
  engraved?: number;
}): Badge[] {
  const out: Badge[] = [];
  if (input.staff) out.push("DEV");
  if (input.pioneerUntil && input.createdAt <= input.pioneerUntil) out.push("PIONEER");
  if (input.ambassador) out.push("AMBASSADOR");
  if (input.sponsorReferrals > 0 && input.installedReferrals >= input.sponsorReferrals) out.push("SPONSOR");
  if (input.recruiterReferrals > 0 && input.installedReferrals >= input.recruiterReferrals) out.push("RECRUITER");
  if (input.discordLinked) out.push("VERIFIED");
  if ((input.prestige ?? 0) > 0) out.push("REBORN");
  if ((input.consecrated ?? 0) > 0) out.push("CONSECRATOR");
  if ((input.engraved ?? 0) > 0) out.push("ENGRAVER");
  return out;
}

/** Badges affichés, dans l'ordre choisi par le joueur ; aucun choix = tous, dans l'ordre par défaut. */
export function orderedBadges(earned: readonly Badge[], order: readonly string[]): Badge[] {
  const chosen = order.filter((b): b is Badge => (earned as readonly string[]).includes(b));
  return chosen.length > 0 ? [...new Set(chosen)] : [...earned];
}
