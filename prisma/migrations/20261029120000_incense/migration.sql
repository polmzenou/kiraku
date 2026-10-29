-- Encens : boost Légendaire+ gagné tous les incense.cardStep cartes tirées en boosters (rétroactif,
-- les disponibles se calculent depuis BoosterOpening moins incenseUsed)
ALTER TABLE "User" ADD COLUMN "incenseUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "incenseUntil" TIMESTAMP(3);

ALTER TABLE "User" ADD CONSTRAINT "User_incenseUsed_check" CHECK ("incenseUsed" >= 0);
