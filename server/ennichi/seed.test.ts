import { describe, expect, it } from "vitest";
import { commitOf } from "@/lib/casino/fairness";
import { coinFlipSeedKey } from "../casino/seed";
import { editionSeed, ennichiSealedSeed, ennichiSeedKey } from "./seed";

// Graine scellée de l'Ennichi : clé propre (pas celle du casino), graine retrouvée depuis le nonce, édition d'avant
// (graine en clair) tirée comme avant.

const SECRET = "secret-de-test-assez-long-pour-auth-secret";
const KEY = ennichiSeedKey(SECRET);
const NONCE = "5c".repeat(32);

describe("graine scellée de l'Ennichi", () => {
  it("clé dérivée du secret, différente de celle du casino", () => {
    expect(KEY.equals(ennichiSeedKey(SECRET))).toBe(true);
    expect(KEY.equals(coinFlipSeedKey(SECRET))).toBe(false);
    expect(KEY.equals(ennichiSeedKey("un-autre-secret-de-test-assez-long-pour-auth"))).toBe(false);
  });

  it("la graine se retrouve depuis le nonce et redonne l'empreinte publiée", async () => {
    const seed = ennichiSealedSeed(KEY, NONCE);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(editionSeed({ seed: null, seedNonce: NONCE }, KEY)).toBe(seed);
    // Une autre clé donne une autre graine : l'empreinte ne correspond plus, le tirage refuse de partir
    const other = editionSeed({ seed: null, seedNonce: NONCE }, ennichiSeedKey("un-autre-secret-de-test-assez-long-pour-auth"))!;
    expect(await commitOf(other)).not.toBe(await commitOf(seed));
  });

  it("édition engagée avant le scellement : la graine en clair fait foi", () => {
    const plain = "ab".repeat(32);
    expect(editionSeed({ seed: plain, seedNonce: null }, KEY)).toBe(plain);
    expect(editionSeed({ seed: null, seedNonce: null }, KEY)).toBeNull();
  });
});
