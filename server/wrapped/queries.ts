import "server-only";
import { unstable_cache } from "next/cache";
import { rarityColor, resolveAppearance } from "@/lib/catalog/appearance";
import { rankOf } from "@/lib/ranked/rules";
import { wrappedPhase, yearWindow, type WrappedPhase } from "@/lib/wrapped/period";
import { pickFavorite, zeniTotals, type WrappedSummary } from "@/lib/wrapped/summary";
import { prisma } from "../db";
import { getRarityDefinitions } from "../catalog/rarities";
import { getRankedRules } from "../ranked/queries";
import { getSetting } from "../settings";
import { readCardWith, readWrappedWith, type RawCard } from "./read";

// Wrapped : récap de l'année d'un joueur, calculé à la demande et gardé une heure (les chiffres de
// décembre bougent encore un peu ; personne n'a besoin de la seconde près).

export type WrappedSettings = { enabled: boolean; year: number; opensAt: string; closesAt: string };

export async function getWrappedSettings(): Promise<WrappedSettings> {
  const [enabled, year, opensAt, closesAt] = await Promise.all([
    getSetting("wrapped.enabled"),
    getSetting("wrapped.year"),
    getSetting("wrapped.opensAt"),
    getSetting("wrapped.closesAt"),
  ]);
  return { enabled, year, opensAt, closesAt };
}

/** Phase du Wrapped à `now` (coupé, avant, ouvert, terminé). */
export async function getWrappedPhase(now = new Date()): Promise<{ settings: WrappedSettings; phase: WrappedPhase }> {
  const settings = await getWrappedSettings();
  return { settings, phase: wrappedPhase(settings, now) };
}

const loadWrapped = unstable_cache(
  async (userId: string, year: number, timeZone: string): Promise<WrappedSummary | null> => {
    const { start, end } = yearWindow(year, timeZone);
    const raw = await readWrappedWith(prisma, userId, start, end);
    if (!raw.username) return null;
    const favorite = pickFavorite(raw.topBattleCard ? [raw.topBattleCard] : [], raw.showcaseCardId, raw.bestPull?.cardId ?? null);
    const favoriteCard = !favorite
      ? null
      : raw.bestPull && favorite.cardId === raw.bestPull.cardId
        ? raw.bestPull
        : await readCardWith(prisma, favorite.cardId);
    let ranked: WrappedSummary["ranked"] = null;
    if (raw.battles.rankedPlayed > 0 && raw.battles.bestPc !== null) {
      const rank = rankOf(raw.battles.bestPc, false, await getRankedRules());
      ranked = { played: raw.battles.rankedPlayed, won: raw.battles.rankedWon, bestPc: raw.battles.bestPc, tier: rank.tier, division: rank.division };
    }
    // Teinte Gold et couleur du cadre : rareté (registre de l'admin) puis réglages propres à la carte
    const definitions = await getRarityDefinitions();
    const card = (c: RawCard) => {
      const definition = definitions.find((d) => d.key === c.rarity);
      return {
        cardId: c.cardId, anilistId: c.anilistId, name: c.name, rarity: c.rarity, imageUrl: c.imageUrl, spoiler: Boolean(c.spoiler),
        gold: resolveAppearance(definition?.appearance, c.appearance).artTone === "gold",
        frame: rarityColor(c.rarity, definition?.appearance),
      };
    };
    return {
      year,
      username: raw.username,
      boosters: raw.boosters,
      bestPull: raw.bestPull ? { ...card(raw.bestPull), at: raw.bestPull.at.toISOString() } : null,
      pulledByRarity: raw.pulledByRarity,
      discoveries: raw.discoveries,
      zeni: zeniTotals(raw.ledger),
      battles: { played: raw.battles.played, won: raw.battles.won },
      ranked,
      favorite: favorite && favoriteCard ? { ...card(favoriteCard), source: favorite.source, battles: favorite.battles } : null,
    };
  },
  ["wrapped-summary-v2"],
  { revalidate: 3_600 },
);

/** Récap de l'année `year` du joueur, ou null s'il n'existe pas. */
export async function getWrapped(userId: string, year: number): Promise<WrappedSummary | null> {
  return loadWrapped(userId, year, await getSetting("game.timeZone"));
}

/**
 * Annonce du Wrapped (bannière de l'accueil, bouton du profil) : l'année à montrer si la période est ouverte
 * et que le joueur a ouvert au moins un booster dans l'année, sinon null. Une seule lecture indexée.
 */
export async function wrappedTeaser(user: { id: string; bannedAt: Date | null } | null, now = new Date()): Promise<number | null> {
  if (!user || user.bannedAt) return null;
  const { settings, phase } = await getWrappedPhase(now);
  if (phase !== "open") return null;
  const { start, end } = yearWindow(settings.year, await getSetting("game.timeZone"));
  const any = await prisma.boosterOpening.findFirst({ where: { userId: user.id, createdAt: { gte: start, lt: end } }, select: { id: true } });
  return any ? settings.year : null;
}

/** Aperçu de l'admin : le récap d'un joueur par son pseudo. */
export async function getWrappedByUsername(username: string, year: number): Promise<WrappedSummary | null> {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return user ? getWrapped(user.id, year) : null;
}
