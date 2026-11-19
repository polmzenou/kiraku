// Numéro d'une édition gravée, dans la transaction d'ouverture (client injecté : serveur ou tests). Le compteur
// (cardId, tirage) est créé au premier besoin avec la taille du moment, puis verrouillé ; le numéro est tiré au
// hasard parmi ceux qui restent. Deux ouvertures qui gravent la même carte passent l'une après l'autre sur ce verrou.
import type { Rng } from "@/lib/rng";
import { pickFreeSerial, type Edition } from "@/lib/prestige/printing";
import type { Tx } from "../social/lock";

/**
 * Prend un numéro libre du tirage `printing` de la carte. `size` ne sert qu'à la création du compteur : un tirage
 * déjà ouvert garde sa taille. Null si le tirage est épuisé (la carte sort ordinaire).
 */
export async function takeSerial(tx: Tx, input: { cardId: string; printing: number; size: number; rng: Rng }): Promise<Edition | null> {
  const { cardId, printing } = input;
  await tx.$executeRaw`
    INSERT INTO "CardPrinting" ("cardId", "printing", "size") VALUES (${cardId}, ${printing}, ${input.size})
    ON CONFLICT ("cardId", "printing") DO NOTHING`;
  const [counter] = await tx.$queryRaw<{ size: number; taken: number[] }[]>`
    SELECT "size", "taken" FROM "CardPrinting" WHERE "cardId" = ${cardId} AND "printing" = ${printing} FOR UPDATE`;
  if (!counter) throw new Error(`Compteur de tirage introuvable (${cardId}, ${printing})`);
  const serial = pickFreeSerial(input.rng, counter.size, counter.taken);
  if (serial === null) return null;
  // Le déclencheur cardprinting_forward_only refuse un numéro hors du tirage ou déjà sorti
  await tx.$executeRaw`
    UPDATE "CardPrinting" SET "issued" = "issued" + 1, "taken" = array_append("taken", ${serial}::int)
    WHERE "cardId" = ${cardId} AND "printing" = ${printing}`;
  return { printing, serial, size: counter.size };
}
