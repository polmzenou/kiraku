import "server-only";
import type { FudaCard } from "@/components/fuda/Fuda";
import { prisma } from "./db";

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

export async function getV2ShowcaseCards(): Promise<ShowcaseCard[]> {
  const cards = await prisma.card.findMany({
    where: { id: { in: V2_SHOWCASE_CARD_IDS }, status: { not: "ARCHIVED" } },
    select: { id: true, name: true, nameNative: true, imageUrl: true, rank: true, rarity: true, power: true, ki: true, appearance: true, formName: true },
  });
  return cards.sort((a, b) => V2_SHOWCASE_CARD_IDS.indexOf(a.id) - V2_SHOWCASE_CARD_IDS.indexOf(b.id));
}
