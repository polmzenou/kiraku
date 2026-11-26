import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Garde-fou du parrainage v2 : chaque point de transfert (cadeaux, échanges, annonces et offres du Marché, enchères et
// mises, avis de recherche, pile ou face) passe par checkReferralLocks (server/referral/locks.ts) dans sa transaction,
// à l'engagement comme à la conclusion (offre acceptée, échange accepté, enchère réglée, avis rempli).
// Un point oublié laisserait un filleul récent céder ses cartes, ou faire passer de la valeur à son parrain.

const GUARDED: Record<string, string[]> = {
  "server/social/gift-core.ts": ["checkUnderLock"],
  "server/social/trade-core.ts": ["proposeTradeWith", "acceptTradeWith"],
  "server/market/listing-core.ts": ["createListingWith", "makeOfferWith", "acceptOfferWith"],
  "server/market/auction-core.ts": ["createAuctionWith", "bidInTx", "settleAuctionWith"],
  "server/market/buy-order-core.ts": ["fillOrderWith"],
  "server/casino/coinflip-core.ts": ["createTableWith", "joinTableWith"],
};

/** Corps de la fonction `name` (de sa déclaration à la suivante, au niveau du fichier). */
function functionBody(source: string, name: string): string | null {
  const start = source.search(new RegExp(`(?:export\\s+)?async\\s+function\\s+${name}\\s*\\(`));
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(|\nexport\s+(?:const|type|class)\s/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

describe("verrous de transfert du parrainage v2", () => {
  for (const [file, names] of Object.entries(GUARDED)) {
    const source = readFileSync(file, "utf8");
    for (const name of names) {
      it(`${file} : ${name} vérifie les verrous`, () => {
        const body = functionBody(source, name);
        expect(body, `${name} introuvable`).not.toBeNull();
        expect(body).toMatch(/checkReferralLocks\(\s*tx,/);
      });
    }
  }

  it("à la conclusion d'un troc, les deux joueurs qui cèdent une carte sont revérifiés", () => {
    const offer = functionBody(readFileSync("server/market/listing-core.ts", "utf8"), "acceptOfferWith") ?? "";
    expect(offer.match(/checkReferralLocks\(\s*tx,/g)).toHaveLength(2);
    expect(offer).toMatch(/actorId: offer\.bidderId/);
    const trade = functionBody(readFileSync("server/social/trade-core.ts", "utf8"), "acceptTradeWith") ?? "";
    expect(trade.match(/checkReferralLocks\(\s*tx,/g)).toHaveLength(2);
    expect(trade).toMatch(/actorId: trade\.proposerId/);
  });

  it("les trois cadeaux passent par le contrôle commun", () => {
    const source = readFileSync("server/social/gift-core.ts", "utf8");
    for (const name of ["giftCardWith", "giftBoosterWith", "giftSealedWith"]) {
      expect(functionBody(source, name), name).toMatch(/checkUnderLock\(tx,/);
    }
  });

  it("le détecteur ne s'arrête pas à la première fonction du fichier", () => {
    const sample = `async function a(tx) {\n  return 1;\n}\nexport async function b(tx) {\n  await checkReferralLocks(tx, {});\n}\n`;
    expect(functionBody(sample, "a")).not.toMatch(/checkReferralLocks/);
    expect(functionBody(sample, "b")).toMatch(/checkReferralLocks\(\s*tx,/);
  });
});
