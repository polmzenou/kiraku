-- AlterEnum
ALTER TYPE "CosmeticKind" ADD VALUE 'NAME_COLOR';

-- AlterTable
ALTER TABLE "Cosmetic" ADD COLUMN     "nameColor" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nameColorId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_nameColorId_fkey" FOREIGN KEY ("nameColorId") REFERENCES "Cosmetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
