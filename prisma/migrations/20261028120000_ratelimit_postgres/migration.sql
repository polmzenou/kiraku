-- Limitation anti-abus en base (remplace Upstash) : un compteur par clé et par fenêtre fixe.
-- UNLOGGED : pas de journal d'écriture (moins cher à chaque vérification) ; perdre les compteurs après
-- un crash du serveur ne fait que rouvrir les fenêtres en cours.
CREATE UNLOGGED TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
