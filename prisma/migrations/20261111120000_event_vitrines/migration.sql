-- Event vitrines (/event) : inscriptions (photo figée d'une vitrine, ids de Card) et votes, par édition
CREATE TABLE "ShowcaseEventEntry" (
    "id" TEXT NOT NULL,
    "edition" VARCHAR(40) NOT NULL,
    "userId" TEXT NOT NULL,
    "showcaseId" TEXT,
    "name" VARCHAR(32),
    "layout" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "cards" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowcaseEventEntry_pkey" PRIMARY KEY ("id")
);

-- Un vote par joueur et par édition, remplacé quand il change d'avis ; retirer l'inscription efface ses votes
CREATE TABLE "ShowcaseEventVote" (
    "edition" VARCHAR(40) NOT NULL,
    "voterId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseEventVote_pkey" PRIMARY KEY ("edition","voterId")
);

CREATE INDEX "ShowcaseEventEntry_edition_createdAt_idx" ON "ShowcaseEventEntry"("edition", "createdAt");
CREATE UNIQUE INDEX "ShowcaseEventEntry_edition_userId_key" ON "ShowcaseEventEntry"("edition", "userId");
CREATE INDEX "ShowcaseEventVote_entryId_idx" ON "ShowcaseEventVote"("entryId");

ALTER TABLE "ShowcaseEventEntry" ADD CONSTRAINT "ShowcaseEventEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShowcaseEventVote" ADD CONSTRAINT "ShowcaseEventVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShowcaseEventVote" ADD CONSTRAINT "ShowcaseEventVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ShowcaseEventEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
