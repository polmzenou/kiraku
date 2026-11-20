// Numéro d'une édition gravée, dans la transaction d'ouverture (client injecté : serveur ou tests). Le compteur
// (cardId, tirage) est créé au premier besoin avec la taille du moment, puis verrouillé ; le numéro est tiré au
// hasard parmi ceux qui restent. Deux ouvertures qui gravent la même carte passent l'une après l'autre sur ce verrou.
import type { Rng } from "@/lib/rng";
import { pickFreeSerial, type Edition } from "@/lib/prestige/printing";
import type { Tx } from "../social/lock";

/** Compteur du tirage, créé au premier besoin avec `size` (un tirage ouvert garde la sienne), verrouillé jusqu'au commit. */
async function lockCounter(tx: Tx, cardId: string, printing: number, size: number): Promise<{ size: number; taken: number[] }> {
  await tx.$executeRaw`
    INSERT INTO "CardPrinting" ("cardId", "printing", "size") VALUES (${cardId}, ${printing}, ${size})
    ON CONFLICT ("cardId", "printing") DO NOTHING`;
  const [counter] = await tx.$queryRaw<{ size: number; taken: number[] }[]>`
    SELECT "size", "taken" FROM "CardPrinting" WHERE "cardId" = ${cardId} AND "printing" = ${printing} FOR UPDATE`;
  if (!counter) throw new Error(`Compteur de tirage introuvable (${cardId}, ${printing})`);
  return counter;
}

/** Marque le numéro comme sorti. Le déclencheur cardprinting_forward_only refuse un numéro hors du tirage ou déjà sorti. */
async function issue(tx: Tx, cardId: string, printing: number, serial: number) {
  await tx.$executeRaw`
    UPDATE "CardPrinting" SET "issued" = "issued" + 1, "taken" = array_append("taken", ${serial}::int)
    WHERE "cardId" = ${cardId} AND "printing" = ${printing}`;
}

/**
 * Prend un numéro libre du tirage `printing` de la carte. `size` ne sert qu'à la création du compteur : un tirage
 * déjà ouvert garde sa taille. Null si le tirage est épuisé (la carte sort ordinaire).
 */
export async function takeSerial(tx: Tx, input: { cardId: string; printing: number; size: number; rng: Rng }): Promise<Edition | null> {
  const { cardId, printing } = input;
  const counter = await lockCounter(tx, cardId, printing, input.size);
  const serial = pickFreeSerial(input.rng, counter.size, counter.taken);
  if (serial === null) return null;
  await issue(tx, cardId, printing, serial);
  return { printing, serial, size: counter.size };
}

/**
 * Prend le numéro `serial` choisi (gravure faite depuis l'admin). Null s'il est hors du tirage ou déjà sorti : un
 * numéro sorti, même recyclé ou consacré depuis, ne ressort jamais.
 */
export async function takeChosenSerial(tx: Tx, input: { cardId: string; printing: number; size: number; serial: number }): Promise<Edition | null> {
  const { cardId, printing, serial } = input;
  const counter = await lockCounter(tx, cardId, printing, input.size);
  if (!Number.isInteger(serial) || serial < 1 || serial > counter.size || counter.taken.includes(serial)) return null;
  await issue(tx, cardId, printing, serial);
  return { printing, serial, size: counter.size };
}
