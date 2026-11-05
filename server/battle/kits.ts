// Kits de l'atelier lus en base : achats et kit choisi d'un joueur pour une liste de personnages, en deux
// requêtes. Le client Prisma est injecté (serveur, transaction ou test) : pas de server/db.ts ici.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { BattleRules } from "@/lib/battle/config";
import { baseKit, effectiveKit, ownedAbilities, slotsOf, type Kit, type OwnedAbilities } from "@/lib/battle/loadout";
import type { Rarity } from "@/lib/catalog/rarity";

type Db = PrismaClient | Prisma.TransactionClient;

/** Ce qu'il faut d'une carte pour son kit : son id, son publicId (alias `anilistId`) et sa rareté. */
export type KitCard = { cardId: string; anilistId: number; rarity: Rarity };

export type KitDetail = { kit: Kit; base: Kit; owned: OwnedAbilities; slots: number };

/** Kit de chaque carte du joueur, avec ce qui l'explique (atelier, fiche de collection). */
export async function loadKitDetails(
  db: Db,
  userId: string,
  cards: readonly KitCard[],
  rules: Pick<BattleRules, "keywordsByRarity" | "newAbilityPct">,
): Promise<Map<string, KitDetail>> {
  const out = new Map<string, KitDetail>();
  if (cards.length === 0) return out;
  const cardIds = [...new Set(cards.map((c) => c.cardId))];
  const [purchases, loadouts] = await Promise.all([
    db.abilityPurchase.findMany({ where: { userId, cardId: { in: cardIds } }, select: { cardId: true, kind: true, ability: true } }),
    db.cardLoadout.findMany({ where: { userId, cardId: { in: cardIds } }, select: { cardId: true, keywords: true, technique: true } }),
  ]);
  const loadoutOf = new Map(loadouts.map((l) => [l.cardId, l]));
  const purchasesOf = new Map<string, typeof purchases>();
  for (const p of purchases) purchasesOf.set(p.cardId, [...(purchasesOf.get(p.cardId) ?? []), p]);
  for (const card of cards) {
    const base = baseKit(card, rules);
    const owned = ownedAbilities(base, purchasesOf.get(card.cardId) ?? []);
    const slots = slotsOf(card, rules);
    out.set(card.cardId, { kit: effectiveKit(base, loadoutOf.get(card.cardId) ?? null, owned, slots), base, owned, slots });
  }
  return out;
}

/** Kit qui combat pour chaque carte du joueur. Les bots n'en ont pas : ils gardent le tirage de leurs cartes. */
export async function loadKits(
  db: Db,
  userId: string,
  cards: readonly KitCard[],
  rules: Pick<BattleRules, "keywordsByRarity" | "newAbilityPct">,
): Promise<Map<string, Kit>> {
  const details = await loadKitDetails(db, userId, cards, rules);
  return new Map([...details].map(([id, d]) => [id, d.kit]));
}
