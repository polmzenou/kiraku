-- CreateEnum
CREATE TYPE "SignalKind" AS ENUM ('IP', 'DEVICE');

-- CreateEnum
CREATE TYPE "SignalEvent" AS ENUM ('SIGNUP', 'REGISTER', 'LOGIN', 'DISCORD', 'SEEN');

-- CreateTable
CREATE TABLE "UserSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SignalKind" NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "firstEvent" "SignalEvent" NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSignal_kind_value_idx" ON "UserSignal"("kind", "value");

-- CreateIndex
CREATE INDEX "UserSignal_lastSeenAt_idx" ON "UserSignal"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSignal_userId_kind_value_key" ON "UserSignal"("userId", "kind", "value");

-- AddForeignKey
ALTER TABLE "UserSignal" ADD CONSTRAINT "UserSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

