import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { commitOf, flipOutcome, verifyFlip } from "@/lib/casino/fairness";
import { coinFlipSeedKey, sealedSeed, tableSeed } from "./seed";

// Graine scellée du pile ou face : la base ne garde que le nonce, la graine se retrouve avec la clé du serveur.

const KEY = coinFlipSeedKey("secret-de-test-assez-long-pour-auth-secret");
const NONCE = "5e".repeat(32);

describe("graine scellée", () => {
  it("clé dérivée du secret, jamais le secret lui-même, et propre au casino", () => {
    expect(KEY).toHaveLength(32);
    expect(KEY.toString("utf8")).not.toContain("secret-de-test");
    expect(KEY.equals(coinFlipSeedKey("secret-de-test-assez-long-pour-auth-secret"))).toBe(true);
    expect(KEY.equals(createHmac("sha256", "secret-de-test-assez-long-pour-auth-secret").update("kiraku/referral-v2/referee-fingerprint").digest())).toBe(false);
  });

  it("graine = HMAC-SHA256(clé, octets du nonce), en hexadécimal minuscule", () => {
    const seed = sealedSeed(KEY, NONCE);
    expect(seed).toBe(createHmac("sha256", KEY).update(Buffer.from(NONCE, "hex")).digest("hex"));
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(seed).not.toBe(NONCE);
  });

  it("sans la clé, le nonce ne donne pas la graine : une autre clé donne une autre graine", () => {
    expect(sealedSeed(coinFlipSeedKey("un-autre-secret-de-test-assez-long-pour-auth"), NONCE)).not.toBe(sealedSeed(KEY, NONCE));
    expect(sealedSeed(KEY, "7a".repeat(32))).not.toBe(sealedSeed(KEY, NONCE));
  });

  it("refuse un nonce mal formé", () => {
    expect(() => sealedSeed(KEY, "AB".repeat(32))).toThrow();
    expect(() => sealedSeed(KEY, "ab")).toThrow();
  });

  it("ancienne table : la graine en clair ; table scellée : retrouvée depuis le nonce", () => {
    const plain = "ab".repeat(32);
    expect(tableSeed({ seed: plain, seedNonce: null }, KEY)).toBe(plain);
    expect(tableSeed({ seed: null, seedNonce: NONCE }, KEY)).toBe(sealedSeed(KEY, NONCE));
    expect(tableSeed({ seed: null, seedNonce: null }, KEY)).toBeNull();
  });

  it("la vérification du joueur ne change pas : engagement et issue se recalculent depuis la graine révélée", async () => {
    const seed = sealedSeed(KEY, NONCE);
    const seedHash = await commitOf(seed);
    const result = await flipOutcome(seed, "table-1");
    expect(await verifyFlip({ tableId: "table-1", seed, seedHash, result })).toMatchObject({ commitOk: true, outcomeOk: true });
  });
});
