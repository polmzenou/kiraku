import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { commitOf, flipDigest, flipOutcome, isSeedHex, otherSide, seedHex, sideFromDigest, verifyFlip } from "./fairness";

const SEED = "a3f1c2d4e5b60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00";
const TABLE = "cmi3k9x2f0007p4sh2ka7rq1";

/** Calcul de référence avec node:crypto, indépendant de Web Crypto. */
function reference(seed: string, tableId: string) {
  const key = Buffer.from(seed, "hex");
  return {
    hash: createHash("sha256").update(key).digest("hex"),
    digest: createHmac("sha256", key).update(tableId, "utf8").digest("hex"),
  };
}

/** Graines reproductibles : SHA-256 de l'index. */
const seedAt = (i: number) => createHash("sha256").update(`kiraku-${i}`).digest("hex");

describe("graine", () => {
  it("encode 32 octets en 64 caractères hexadécimaux minuscules", () => {
    const bytes = new Uint8Array(32).map((_, i) => i * 7);
    const hex = seedHex(bytes);
    expect(hex).toHaveLength(64);
    expect(isSeedHex(hex)).toBe(true);
    expect(hex.slice(0, 6)).toBe("00070e");
  });

  it("refuse une graine d'une autre taille", () => {
    expect(() => seedHex(new Uint8Array(16))).toThrow();
  });

  it("reconnaît une graine bien formée seulement", () => {
    expect(isSeedHex(SEED)).toBe(true);
    expect(isSeedHex(SEED.toUpperCase())).toBe(false);
    expect(isSeedHex(SEED.slice(1))).toBe(false);
    expect(isSeedHex(`${SEED.slice(1)}g`)).toBe(false);
  });
});

describe("engagement et issue", () => {
  it("l'empreinte est le SHA-256 des octets de la graine", async () => {
    expect(await commitOf(SEED)).toBe(reference(SEED, TABLE).hash);
  });

  it("le HMAC prend la graine comme clé et l'id de la table comme message", async () => {
    expect(await flipDigest(SEED, TABLE)).toBe(reference(SEED, TABLE).digest);
  });

  it.each(Array.from({ length: 12 }, (_, i) => i))("graine n°%i : même résultat que node:crypto", async (i) => {
    const seed = seedAt(i);
    const ref = reference(seed, `table-${i}`);
    expect(await commitOf(seed)).toBe(ref.hash);
    const expected = Number.parseInt(ref.digest.slice(0, 2), 16) % 2 === 0 ? "OMOTE" : "URA";
    expect(await flipOutcome(seed, `table-${i}`)).toBe(expected);
  });

  it("premier octet pair → 表, impair → 裏", () => {
    expect(sideFromDigest("00ff")).toBe("OMOTE");
    expect(sideFromDigest("fe00")).toBe("OMOTE");
    expect(sideFromDigest("01")).toBe("URA");
    expect(sideFromDigest("ff")).toBe("URA");
  });

  it("l'issue dépend de la table : la même graine ne rejoue pas le même lancer partout", async () => {
    const sides = new Set<string>();
    for (let i = 0; i < 16; i++) sides.add(await flipOutcome(SEED, `table-${i}`));
    expect(sides.size).toBe(2);
  });

  it("les deux faces sortent à parts égales sur 10 000 graines (entre 48,5 et 51,5 %)", async () => {
    let omote = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) if ((await flipOutcome(seedAt(i), TABLE)) === "OMOTE") omote += 1;
    expect(omote / n).toBeGreaterThan(0.485);
    expect(omote / n).toBeLessThan(0.515);
  });

  it("otherSide inverse la face", () => {
    expect(otherSide("OMOTE")).toBe("URA");
    expect(otherSide("URA")).toBe("OMOTE");
  });
});

describe("vérification d'un lancer", () => {
  it("valide un lancer honnête", async () => {
    const seedHash = await commitOf(SEED);
    const result = await flipOutcome(SEED, TABLE);
    const v = await verifyFlip({ tableId: TABLE, seed: SEED, seedHash, result });
    expect(v).toMatchObject({ commitOk: true, outcomeOk: true, hash: seedHash, side: result });
  });

  it("détecte une graine changée après coup", async () => {
    const seedHash = await commitOf(SEED);
    const other = seedAt(99);
    const v = await verifyFlip({ tableId: TABLE, seed: other, seedHash, result: await flipOutcome(other, TABLE) });
    expect(v?.commitOk).toBe(false);
    expect(v?.outcomeOk).toBe(true);
  });

  it("détecte une issue falsifiée", async () => {
    const seedHash = await commitOf(SEED);
    const result = otherSide(await flipOutcome(SEED, TABLE));
    const v = await verifyFlip({ tableId: TABLE, seed: SEED, seedHash, result });
    expect(v).toMatchObject({ commitOk: true, outcomeOk: false });
  });

  it("détecte un id de table substitué", async () => {
    const seedHash = await commitOf(SEED);
    // Une table dont l'issue diffère de celle de TABLE avec la même graine
    let other = "";
    const real = await flipOutcome(SEED, TABLE);
    for (let i = 0; !other; i++) if ((await flipOutcome(SEED, `x${i}`)) !== real) other = `x${i}`;
    const v = await verifyFlip({ tableId: other, seed: SEED, seedHash, result: real });
    expect(v?.outcomeOk).toBe(false);
  });

  it("accepte une empreinte en majuscules, refuse une graine mal formée", async () => {
    const seedHash = (await commitOf(SEED)).toUpperCase();
    expect((await verifyFlip({ tableId: TABLE, seed: SEED, seedHash, result: "OMOTE" }))?.commitOk).toBe(true);
    expect(await verifyFlip({ tableId: TABLE, seed: "zz", seedHash, result: "OMOTE" })).toBeNull();
  });
});
