import "server-only";
import type { FudaCard } from "@/components/fuda/Fuda";
import { announcementDue } from "@/lib/casino/phase";
import { referralAnnouncementAt } from "@/lib/referral/announce";
import { ANNOUNCEMENTS, pendingAnnouncement, type Announcement } from "@/lib/welcome/release";
import { spoilerKeyOf } from "@/lib/spoiler";
import { getCasinoRules } from "./casino/queries";
import { prisma } from "./db";
import { getSetting } from "./settings";

/**
 * Annonce à présenter à ce joueur : les annonces du code, plus celle de l'ouverture du casino (datée par
 * casino.opensAt) et celle du nouveau parrainage (referral.v2.announceAt), pour les comptes inscrits avant, pendant
 * leur fenêtre de lancement.
 */
export async function pendingAnnouncementFor(user: { v1WelcomeSeenAt: Date | null; isGuest: boolean; createdAt: Date }): Promise<Announcement | null> {
  const [rules, enabled, announceAt, announceDays] = await Promise.all([
    getCasinoRules(),
    getSetting("referral.v2.enabled"),
    getSetting("referral.v2.announceAt"),
    getSetting("referral.v2.announceDays"),
  ]);
  const now = new Date();
  const list: Announcement[] = [...ANNOUNCEMENTS];
  if (rules.opensAt !== null && announcementDue(rules, now.getTime(), user)) list.push({ key: "casino", at: new Date(rules.opensAt) });
  const referralAt = referralAnnouncementAt({ enabled, announceAt, announceDays }, now.getTime(), user);
  if (referralAt) list.push({ key: "referral", at: referralAt });
  return pendingAnnouncement(user.v1WelcomeSeenAt, now, list);
}

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
    select: { id: true, name: true, nameNative: true, imageUrl: true, rank: true, rarity: true, power: true, ki: true, appearance: true, formName: true, spoiler: true, seriesId: true, series: { select: { universeId: true } } },
  });
  return cards
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .map(({ seriesId, series, ...card }) => ({ ...card, spoilerKey: card.spoiler ? spoilerKeyOf({ id: seriesId, universeId: series.universeId }) : null }));
}

export const getV2ShowcaseCards = () => showcaseCards(V2_SHOWCASE_CARD_IDS);
