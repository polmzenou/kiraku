import "server-only";
import { isFrozen } from "@/lib/account/deletion";
import { normalizeReferralCode } from "@/lib/economy/referral";
import { decorFromRelations, type PlayerDecor } from "@/lib/profile/decor";
import { prisma } from "../db";
import { decorSelect } from "../profile/decor";
import { remoteImage } from "./assets";

// Données des images de partage : quelques fuda vedettes pour l'accueil, le parrain d'un lien /i/CODE.

export type OgCard = { name: string; rarity: string; image: string };

const SHOWCASE_RARITIES = ["LEGENDARY", "MYTHIC", "EPIC"] as const;

/** Une fuda par rareté (Légendaire, Mythique, Épique), les plus aimées du catalogue publié, illustration chargée. */
export async function showcaseCards(): Promise<OgCard[]> {
  try {
    const picks = await Promise.all(
      SHOWCASE_RARITIES.map(async (rarity): Promise<OgCard | null> => {
        const rows = await prisma.card.findMany({
          where: { status: "PUBLISHED", variantOfId: null, rarity },
          orderBy: { favorites: "desc" },
          take: 3,
          select: { name: true, imageUrl: true },
        });
        for (const row of rows) {
          const image = await remoteImage(row.imageUrl);
          if (image) return { name: row.name, rarity, image };
        }
        return null;
      }),
    );
    return picks.filter((c): c is OgCard => c !== null);
  } catch (e) {
    console.error("[og] fuda vedettes", e);
    return [];
  }
}

export type OgReferrer = { username: string; image: string | null; decor: PlayerDecor };

/** Parrain d'un code d'invitation : joueur inscrit, actif. null sinon (invitation générique). */
export async function referrerByCode(raw: string): Promise<OgReferrer | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { username: true, image: true, isGuest: true, bannedAt: true, deletionRequestedAt: true, anonymizedAt: true, ...decorSelect },
  });
  if (!user || user.isGuest || user.bannedAt || isFrozen(user)) return null;
  return { username: user.username, image: user.image, decor: decorFromRelations(user) };
}
