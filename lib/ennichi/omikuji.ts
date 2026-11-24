// Tirage vérifiable de l'omikuji de l'Ennichi, en Web Crypto : le même code tourne sur le serveur et dans le navigateur
// du joueur, qui refait tout le tirage (feuille « Vérifier »), comme le pile ou face (lib/casino/fairness.ts).
//   1. Au lancement de la fête, le serveur tire une graine de 32 octets et publie son empreinte SHA-256.
//   2. À la clôture, la liste des tickets est figée (un par ami arrivé pendant la fête et installé, dans l'ordre des
//      installations) et son empreinte publiée.
//   3. Les lots sont tirés du plus rare au moins rare (règle choisie le 2026-11-24) : pour le lot n° i, le ticket gagnant
//      est pris parmi ceux qui n'ont encore rien gagné, à partir de HMAC-SHA256(graine, « omikuji:i:k »). Chaque ticket
//      gagne au plus un lot ; s'il n'en reste plus, le reste de la cagnotte n'est pas distribué.
//   4. La graine est révélée : SHA-256(graine) redonne l'empreinte, et le tirage se refait à l'identique.
import { commitOf, isSeedHex, toHex } from "@/lib/casino/fairness";

/** Chance écrite sur chaque feuille, par ligne de la cagnotte (du plus rare au moins rare). */
export const OMIKUJI_LUCK = ["大吉", "中吉", "小吉", "吉", "末吉", "末小吉"] as const;
export const luckOf = (line: number) => OMIKUJI_LUCK[line] ?? "吉";

export type OmikujiDraw = {
  /** Numéro du tirage, à partir de 1, dans l'ordre de la cagnotte. */
  n: number;
  /** Lot de la cagnotte (son index dans la liste des lots dépliée). */
  prize: number;
  /** Ticket gagnant (son index dans la liste figée). */
  ticket: number;
};

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto indisponible");
  return s;
}

function bytesOf(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Empreinte de la liste des tickets figée à la clôture : SHA-256 des libellés, un par ligne. */
export async function ticketsHash(tickets: readonly string[]): Promise<string> {
  return toHex(new Uint8Array(await subtle().digest("SHA-256", new TextEncoder().encode(tickets.join("\n")))));
}

/**
 * Entier uniforme dans [0, n) tiré de HMAC(graine, « omikuji:i:k ») : mots de 32 bits pris dans l'ordre, rejet de la
 * fin de plage (pas de biais), nouveau HMAC (k + 1) si aucun mot ne convient.
 */
async function uniformIndex(key: CryptoKey, i: number, n: number): Promise<number> {
  if (n <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (let k = 0; ; k++) {
    const mac = new Uint8Array(await subtle().sign("HMAC", key, new TextEncoder().encode(`omikuji:${i}:${k}`)));
    for (let w = 0; w + 4 <= mac.length; w += 4) {
      const v = ((mac[w] << 24) >>> 0) + (mac[w + 1] << 16) + (mac[w + 2] << 8) + mac[w + 3];
      if (v < limit) return v % n;
    }
  }
}

/**
 * Tirage complet : `prizes` lots dans l'ordre de la cagnotte (le plus rare d'abord), `tickets` tickets figés. Chaque
 * ticket gagne au plus un lot ; quand il n'en reste plus, le tirage s'arrête.
 */
export async function drawOmikuji(seed: string, ticketCount: number, prizeCount: number): Promise<OmikujiDraw[]> {
  if (!isSeedHex(seed)) throw new Error("Graine invalide");
  const key = await subtle().importKey("raw", bytesOf(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const left = Array.from({ length: Math.max(0, ticketCount) }, (_, i) => i);
  const draws: OmikujiDraw[] = [];
  for (let prize = 0; prize < prizeCount && left.length > 0; prize++) {
    const pick = await uniformIndex(key, prize, left.length);
    const [ticket] = left.splice(pick, 1);
    draws.push({ n: draws.length + 1, prize, ticket });
  }
  return draws;
}

/** Lots de la cagnotte dépliés dans l'ordre (un par unité), chacun désigné par l'index de sa ligne. */
export function unfoldPrizes(pool: readonly { count: number }[]): number[] {
  return pool.flatMap((p, line) => Array.from({ length: Math.max(0, p.count) }, () => line));
}

export type OmikujiProof = { seed: string; seedHash: string; tickets: readonly string[]; ticketsHash: string; prizeCount: number; draws: readonly OmikujiDraw[] };
export type OmikujiVerification = { commitOk: boolean; ticketsOk: boolean; drawsOk: boolean; draws: OmikujiDraw[] };

/** Recalcul complet d'un tirage publié ; une graine mal formée ne vérifie rien. */
export async function verifyOmikuji(proof: OmikujiProof): Promise<OmikujiVerification | null> {
  if (!isSeedHex(proof.seed)) return null;
  const [hash, tHash, draws] = await Promise.all([commitOf(proof.seed), ticketsHash(proof.tickets), drawOmikuji(proof.seed, proof.tickets.length, proof.prizeCount)]);
  const same = draws.length === proof.draws.length && draws.every((d, i) => d.prize === proof.draws[i].prize && d.ticket === proof.draws[i].ticket);
  return { commitOk: hash === proof.seedHash.toLowerCase(), ticketsOk: tHash === proof.ticketsHash.toLowerCase(), drawsOk: same, draws };
}
