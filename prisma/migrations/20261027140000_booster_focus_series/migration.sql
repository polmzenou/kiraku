-- AlterEnum : booster Focus série
ALTER TYPE "BoosterKind" ADD VALUE 'FOCUS' BEFORE 'DROP';

-- AlterTable : œuvres mises en avant, cartes focus recalculées avec le pool, date d'activation
ALTER TABLE "BoosterType" ADD COLUMN "focusSeriesIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "focusCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "activatedAt" TIMESTAMP(3);
