-- Sondages des annonces : une réponse oui/non par joueur et par sondage (Discord dans l'annonce v2.5)
CREATE TABLE "PollVote" (
    "userId" TEXT NOT NULL,
    "poll" TEXT NOT NULL,
    "answer" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("userId","poll")
);

-- CreateIndex
CREATE INDEX "PollVote_poll_answer_idx" ON "PollVote"("poll", "answer");

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
