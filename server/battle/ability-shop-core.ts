// Atelier : achat de passifs et de techniques par personnage, et choix du kit. Le client Prisma est injecté
// (serveur ou test de concurrence) : pas de server/db.ts ici. Le client n'envoie que des ids, la capacité
// voulue, le prix qu'il a vu et l'emplacement à remplacer : la possession, le prix et le kit sont relus ici.
//
// Ordre, partout : verrou du joueur (lockPlayers, le même que les autres dépenses de Zeni), contrôles, puis
// écritures. Deux achats simultanés de la même capacité attendent ce verrou : le second voit ALREADY_OWNED,
// et la contrainte unique d'AbilityPurchase reste le dernier rempart.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { BattleRules } from "@/lib/battle/config";
import {
  abilityPrice,
  baseKit,
  checkEquip,
  effectiveKit,
  ownedAbilities,
  sameKit,
  slotsOf,
  withAbility,
  type AbilityKind,
  type Kit,
  type LoadoutRow,
} from "@/lib/battle/loadout";
import type { Keyword, Technique } from "@/lib/battle/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { debit, LedgerError } from "../economy/ledger";
import { lockPlayers, type Tx } from "../social/lock";
import { BattleError } from "./battle-core";

const TX = { maxWait: 10_000, timeout: 20_000 };

type ShopRules = Pick<BattleRules, "enabled" | "abilityShopEnabled" | "abilityPrices" | "keywordsByRarity" | "newAbilityPct">;

async function lockBuyer(tx: Tx, userId: string) {
  const me = (await lockPlayers(tx, [userId])).get(userId);
  if (!me) throw new BattleError("NO_USER");
  if (me.bannedAt) throw new BattleError("BANNED");
  if (me.isGuest) throw new BattleError("GUEST");
  return me;
}

/** Le personnage, son kit et ce que le joueur en a acquis. NOT_OWNED sans aucun exemplaire, quel que soit son état. */
async function readCard(tx: Tx, userId: string, cardId: string, rules: ShopRules) {
  const card = await tx.card.findUnique({ where: { id: cardId }, select: { id: true, publicId: true, rarity: true } });
  if (!card) throw new BattleError("NOT_OWNED");
  const copies = await tx.userCard.count({ where: { ownerId: userId, cardId } });
  if (copies === 0) throw new BattleError("NOT_OWNED");
  const [purchases, loadout] = await Promise.all([
    tx.abilityPurchase.findMany({ where: { userId, cardId }, select: { kind: true, ability: true } }),
    tx.cardLoadout.findUnique({ where: { userId_cardId: { userId, cardId } }, select: { keywords: true, technique: true } }),
  ]);
  const ref = { anilistId: card.publicId, rarity: card.rarity as Rarity };
  const base = baseKit(ref, rules);
  const slots = slotsOf(ref, rules);
  const owned = ownedAbilities(base, purchases);
  return { base, slots, owned, purchases, kit: effectiveKit(base, loadout, owned, slots) };
}

/** Enregistre le kit choisi, champ par champ ; le kit d'origine efface la ligne (absente = kit tiré au sort). */
async function writeLoadout(tx: Tx, userId: string, cardId: string, kit: Kit, base: Kit) {
  if (sameKit(kit, base)) {
    await tx.cardLoadout.deleteMany({ where: { userId, cardId } });
    return;
  }
  await tx.cardLoadout.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: { userId, cardId, keywords: [...kit.keywords], technique: kit.technique },
    update: { keywords: [...kit.keywords], technique: kit.technique },
  });
}

function assertOpen(rules: ShopRules) {
  if (!rules.enabled || !rules.abilityShopEnabled) throw new BattleError("DISABLED");
}

export type BuyAbilityInput = {
  userId: string;
  cardId: string;
  kind: AbilityKind;
  ability: Keyword | Technique;
  /** Prix affiché au joueur : revérifié, STALE s'il a changé depuis. */
  expectedPrice: number;
  /** Emplacement à remplacer tout de suite (0 pour la technique) ; null : achat sans équiper. */
  slot: number | null;
  now: Date;
};

/** Achète une capacité pour un personnage : débit, ligne de journal ABILITY et achat écrits ensemble. */
export async function buyAbilityWith(db: PrismaClient, input: BuyAbilityInput, rules: ShopRules): Promise<{ coins: number; kit: Kit; price: number }> {
  assertOpen(rules);
  return db.$transaction(async (tx) => {
    await lockBuyer(tx, input.userId);
    const { base, slots, owned, kit } = await readCard(tx, input.userId, input.cardId, rules);
    if (input.kind === "KEYWORD" && slots === 0) throw new BattleError("NO_SLOT");
    const has = input.kind === "KEYWORD" ? owned.keywords.has(input.ability as Keyword) : owned.techniques.has(input.ability as Technique);
    if (has) throw new BattleError("ALREADY_OWNED");
    // L'emplacement est vérifié avant tout débit : un mauvais emplacement ne coûte rien
    const next = input.slot === null ? null : withAbility(kit, input.kind, input.ability, input.slot);
    if (input.slot !== null && !next) throw new BattleError("BAD_KIT");

    const price = abilityPrice(rules.abilityPrices, input.kind, input.ability);
    // Le prix a changé depuis l'affichage : le joueur doit revoir ce qu'il paie
    if (price !== input.expectedPrice) throw new BattleError("STALE");

    try {
      await tx.abilityPurchase.create({
        data: { userId: input.userId, cardId: input.cardId, kind: input.kind, ability: input.ability, price, createdAt: input.now },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new BattleError("ALREADY_OWNED");
      throw e;
    }
    let coins: number;
    try {
      coins = await debit(tx, { userId: input.userId, amount: price, reason: "ABILITY", refId: input.cardId, now: input.now });
    } catch (e) {
      if (e instanceof LedgerError && e.code === "NOT_ENOUGH_ZENI") throw new BattleError("NOT_ENOUGH_ZENI");
      throw e;
    }
    if (next) await writeLoadout(tx, input.userId, input.cardId, next, base);
    return { coins, kit: next ?? kit, price };
  }, TX);
}

export type EquipInput = {
  userId: string;
  cardId: string;
  /** Nouveau kit complet ; null : retour au kit d'origine (rien n'est remboursé, les achats restent acquis). */
  kit: LoadoutRow | null;
};

/** Change le kit d'un personnage parmi ce qui est acquis : gratuit, sans limite. */
export async function equipWith(db: PrismaClient, input: EquipInput, rules: ShopRules): Promise<{ kit: Kit }> {
  assertOpen(rules);
  return db.$transaction(async (tx) => {
    await lockBuyer(tx, input.userId);
    const { base, slots, owned } = await readCard(tx, input.userId, input.cardId, rules);
    const kit = input.kit === null ? base : checkEquip(input.kit, owned, slots);
    if (!kit) throw new BattleError("BAD_KIT");
    await writeLoadout(tx, input.userId, input.cardId, kit, base);
    return { kit };
  }, TX);
}
