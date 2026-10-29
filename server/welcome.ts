import "server-only";
import type { FudaCard } from "@/components/fuda/Fuda";
import { localize, parseLocalized, parseTheme, type BoosterShape, type BoosterTheme } from "@/lib/boosters/types";
import { DISCORD_POLL } from "@/lib/welcome/poll";
import { prisma } from "./db";
import { lotViews } from "./economy/lot-view";
import { getSetting } from "./settings";

/**
 * Cartes Gold et AR mises en avant par l'annonce de la v2, dans cet ordre (les cinq premières forment
 * l'éventail, de gauche à droite). Elles peuvent encore être en brouillon : l'annonce en est
 * l'avant-première. Les cartes archivées ou supprimées sont ignorées.
 */
const V2_SHOWCASE_CARD_IDS = [
  "cmvp2nn9s000008kzmfofvtxj", // Giorno Giovanna · AR
  "cmvp4bkuf000007l3lr4z0kkd", // Toshinori Yagi · Gold
  "cmvp4fi8g000007kx5qdqsp5b", // Levi Ackermann · Gold
  "cmvp1whn0000l08jj84dgry3e", // Ulquiorra Cifer · AR
  "cmvp4jb71000207l3c22c8v9g", // Taiga Kagami · Gold
  "cmvp383md000208l8fqhuty3s", // Ken Kaneki · AR
  "cmvp2srco000008iijoglaqqi", // Reze · AR
  "cmvp3b03u000008jys6tbkxgi", // Akira Fudou · AR
  "cmvp2w24x000008jhagjj4awu", // Shigeo Kageyama · AR
];

export type ShowcaseCard = FudaCard & { id: string };

async function showcaseCards(ids: readonly string[]): Promise<ShowcaseCard[]> {
  const cards = await prisma.card.findMany({
    where: { id: { in: [...ids] }, status: { not: "ARCHIVED" } },
    select: { id: true, name: true, nameNative: true, imageUrl: true, rank: true, rarity: true, power: true, ki: true, appearance: true, formName: true },
  });
  return cards.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

export const getV2ShowcaseCards = () => showcaseCards(V2_SHOWCASE_CARD_IDS);

export type V25Data = {
  /** Paliers du parrainage (amis qualifiés → nom du lot), lus dans les réglages. */
  milestones: { referrals: number; reward: string }[];
  incense: { cardStep: number; hours: number };
  imperial: { name: string; emblem: string; shape: BoosterShape; theme: BoosterTheme } | null;
  /** Réponse déjà donnée au sondage Discord (null = pas encore). */
  vote: boolean | null;
};

/** Ce que l'annonce de la v2.5 affiche : tout vient des réglages et de la base, rien en dur. */
export async function getV25Data(userId: string, locale: string): Promise<V25Data> {
  const [milestones, cardStep, hours, imperial, vote] = await Promise.all([
    getSetting("referral.milestones"),
    getSetting("incense.cardStep"),
    getSetting("incense.durationHours"),
    prisma.boosterType.findUnique({ where: { slug: "imperial" }, select: { name: true, emblem: true, shape: true, theme: true, active: true } }),
    prisma.pollVote.findUnique({ where: { userId_poll: { userId, poll: DISCORD_POLL } }, select: { answer: true } }),
  ]);
  const lots = await lotViews(milestones.map((m) => m.lotId), locale);
  return {
    milestones: milestones
      .flatMap((m) => {
        const lot = lots.get(m.lotId);
        return lot ? [{ referrals: m.referrals, reward: lot.name }] : [];
      })
      .sort((a, b) => a.referrals - b.referrals),
    incense: { cardStep, hours },
    imperial: imperial?.active
      ? { name: localize(parseLocalized(imperial.name, "Impérial"), locale), emblem: imperial.emblem, shape: imperial.shape, theme: parseTheme(imperial.theme) }
      : null,
    vote: vote?.answer ?? null,
  };
}
