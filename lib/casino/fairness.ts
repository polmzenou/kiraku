// Tirage vérifiable du pile ou face, en Web Crypto : le même code tourne sur le serveur (Node) et dans le
// navigateur du joueur, qui recalcule tout.
//   1. À l'ouverture de la table, le serveur fixe une graine de 32 octets et ne publie que son empreinte
//      SHA-256 (l'engagement) : il ne peut plus la changer sans que ça se voie. La base n'en garde qu'un nonce,
//      la graine se retrouve avec une clé du serveur (server/casino/seed.ts).
//   2. Issue : premier octet de HMAC-SHA256(graine, id de la table). Pair → 表 (face), impair → 裏 (pile).
//      L'id de la table est connu de tous ; la graine reste secrète jusqu'au lancer.
//   3. Une fois la table jouée, la graine est révélée : SHA-256(graine) doit redonner l'empreinte, et le
//      HMAC l'issue annoncée.

export const COIN_SIDES = ["OMOTE", "URA"] as const;
export type CoinSide = (typeof COIN_SIDES)[number];

export const SEED_BYTES = 32;
const HEX_64 = /^[0-9a-f]{64}$/;

export function otherSide(side: CoinSide): CoinSide {
  return side === "OMOTE" ? "URA" : "OMOTE";
}

export function isSeedHex(value: string): boolean {
  return HEX_64.test(value);
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) throw new Error("Hexadécimal invalide");
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Graine en hexadécimal (64 caractères) à partir de 32 octets tirés par le serveur. */
export function seedHex(bytes: Uint8Array): string {
  if (bytes.length !== SEED_BYTES) throw new Error(`La graine doit faire ${SEED_BYTES} octets`);
  return toHex(bytes);
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto indisponible");
  return s;
}

/** Empreinte publiée à l'ouverture : SHA-256 des octets de la graine, en hexadécimal. */
export async function commitOf(seed: string): Promise<string> {
  if (!isSeedHex(seed)) throw new Error("Graine invalide");
  return toHex(new Uint8Array(await subtle().digest("SHA-256", fromHex(seed))));
}

/** HMAC-SHA256(graine, id de la table), en hexadécimal. */
export async function flipDigest(seed: string, tableId: string): Promise<string> {
  if (!isSeedHex(seed)) throw new Error("Graine invalide");
  const key = await subtle().importKey("raw", fromHex(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = new TextEncoder().encode(tableId);
  return toHex(new Uint8Array(await subtle().sign("HMAC", key, message)));
}

/** Face désignée par un HMAC : premier octet pair → 表, impair → 裏. */
export function sideFromDigest(digest: string): CoinSide {
  return Number.parseInt(digest.slice(0, 2), 16) % 2 === 0 ? "OMOTE" : "URA";
}

export async function flipOutcome(seed: string, tableId: string): Promise<CoinSide> {
  return sideFromDigest(await flipDigest(seed, tableId));
}

export type FlipProof = { tableId: string; seed: string; seedHash: string; result: CoinSide };

export type FlipVerification = {
  /** SHA-256(graine) redonne l'empreinte publiée à l'ouverture. */
  commitOk: boolean;
  /** Le HMAC désigne bien la face annoncée. */
  outcomeOk: boolean;
  hash: string;
  digest: string;
  side: CoinSide;
};

/** Recalcul complet d'un lancer joué ; une graine mal formée ne vérifie rien. */
export async function verifyFlip(proof: FlipProof): Promise<FlipVerification | null> {
  if (!isSeedHex(proof.seed)) return null;
  const [hash, digest] = await Promise.all([commitOf(proof.seed), flipDigest(proof.seed, proof.tableId)]);
  const side = sideFromDigest(digest);
  return { commitOk: hash === proof.seedHash.toLowerCase(), outcomeOk: side === proof.result, hash, digest, side };
}
