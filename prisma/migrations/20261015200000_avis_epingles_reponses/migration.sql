-- AlterTable
ALTER TABLE "Review" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "reply" TEXT,
ADD COLUMN "repliedAt" TIMESTAMP(3);

-- Un avis masqué n'est jamais épinglé ; réponse bornée, même si une écriture contourne Zod
ALTER TABLE "Review" ADD CONSTRAINT "Review_pinned_visible_check" CHECK (NOT ("pinned" AND "hidden"));
ALTER TABLE "Review" ADD CONSTRAINT "Review_reply_check" CHECK ("reply" IS NULL OR char_length("reply") BETWEEN 1 AND 1000);
