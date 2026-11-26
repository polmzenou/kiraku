-- Ennichi : la graine du tirage n'est plus lisible en base avant le tirage (comme les tables du casino, migration
-- 20261126130000). À l'engagement, seul un nonce est écrit ; la graine vaut HMAC-SHA256(clé dérivée d'AUTH_SECRET,
-- nonce) et n'est écrite en clair qu'au tirage. Une édition engagée avant cette migration garde sa graine en clair
-- (seedNonce nul) et se tire comme avant. Les rangs du banzuke sont figés au tirage, comme la cagnotte.

-- AlterTable
ALTER TABLE "EnnichiDraw" ADD COLUMN     "ranks" JSONB,
ADD COLUMN     "seedNonce" CHAR(64),
ALTER COLUMN "seed" DROP NOT NULL;

-- Graine, nonce et empreinte en hexadécimal minuscule (32 octets) ; la graine peut manquer tant que le tirage n'est pas fait
ALTER TABLE "EnnichiDraw" DROP CONSTRAINT "EnnichiDraw_hex_check";
ALTER TABLE "EnnichiDraw" ADD CONSTRAINT "EnnichiDraw_hex_check" CHECK (
    ("seed" IS NULL OR "seed" ~ '^[0-9a-f]{64}$')
    AND ("seedNonce" IS NULL OR "seedNonce" ~ '^[0-9a-f]{64}$')
    AND "seedHash" ~ '^[0-9a-f]{64}$'
);

-- Toujours une source de graine ; le tirage la révèle ; une édition scellée pas encore tirée ne l'a jamais en clair
ALTER TABLE "EnnichiDraw" ADD CONSTRAINT "EnnichiDraw_seed_sealed" CHECK (
    num_nonnulls("seed", "seedNonce") >= 1
    AND ("drawnAt" IS NULL OR "seed" IS NOT NULL)
    AND ("drawnAt" IS NOT NULL OR "seedNonce" IS NULL OR "seed" IS NULL)
);
