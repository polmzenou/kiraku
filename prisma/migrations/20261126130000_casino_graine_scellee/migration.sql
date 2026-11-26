-- Pile ou face : la graine d'une table ouverte n'est plus lisible en base. À la pose, seul un nonce est écrit ;
-- la graine vaut HMAC-SHA256(clé dérivée d'AUTH_SECRET, nonce) et n'est écrite en clair qu'au lancer.
-- Les tables posées avant cette migration gardent leur graine en clair (seedNonce nul) et se jouent comme avant.

-- AlterTable
ALTER TABLE "CoinFlip" ADD COLUMN     "seedNonce" CHAR(64),
ALTER COLUMN "seed" DROP NOT NULL;

-- Graine, nonce et empreinte en hexadécimal minuscule (32 octets) ; la graine peut manquer tant que la table n'est pas jouée
ALTER TABLE "CoinFlip" DROP CONSTRAINT "CoinFlip_seed_hex";
ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_seed_hex" CHECK (
    ("seed" IS NULL OR "seed" ~ '^[0-9a-f]{64}$')
    AND ("seedNonce" IS NULL OR "seedNonce" ~ '^[0-9a-f]{64}$')
    AND "seedHash" ~ '^[0-9a-f]{64}$'
);

-- Toujours une source de graine ; une table jouée la révèle ; une table scellée encore ouverte ne l'a jamais en clair
ALTER TABLE "CoinFlip" ADD CONSTRAINT "CoinFlip_seed_sealed" CHECK (
    num_nonnulls("seed", "seedNonce") >= 1
    AND ("status" <> 'DONE' OR "seed" IS NOT NULL)
    AND ("status" <> 'OPEN' OR "seedNonce" IS NULL OR "seed" IS NULL)
);
