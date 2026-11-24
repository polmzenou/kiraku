-- Parrainage v2 (étape 18) : étapes du filleul horodatées, contrôles (confiance, « À vérifier », décision de l'équipe),
-- journal des versements (garde contre le double versement et base de la reprise), empreintes des filleuls, bons,
-- Ambassadeurs proposés, codes perso et origine de chaque ouverture de booster. Rien ne change pour la v1 tant que
-- l'interrupteur referral.v2.enabled est coupé.

-- Enums
ALTER TYPE "CoinReason" ADD VALUE 'REFERRAL_CLAWBACK';
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_REWARD';
CREATE TYPE "OpeningSource" AS ENUM ('FREE', 'PAID', 'CREDIT', 'SEALED');
CREATE TYPE "ReferralHoldReason" AS ENUM ('DEVICE', 'SCORE');
CREATE TYPE "ReferralDecision" AS ENUM ('VALIDATED', 'REVOKED', 'BANNED');
CREATE TYPE "ReferralRewardKind" AS ENUM ('STEP', 'TRUST_BONUS', 'MILESTONE', 'GRAND');
CREATE TYPE "ReferralSide" AS ENUM ('REFEREE', 'REFERRER');
CREATE TYPE "FingerprintKind" AS ENUM ('DISCORD', 'EMAIL');
CREATE TYPE "VoucherKind" AS ENUM ('MYTHIC_CHOICE', 'ONE_OF_ONE');

-- Origine des ouvertures : l'étape 2 ne compte que la réserve gratuite et les boosters achetés. Le passé est classé au
-- mieux (sachet, Zeni payés, sinon réserve) ; une ouverture écrite sans origine compte comme un cadeau.
ALTER TABLE "BoosterOpening" ADD COLUMN "source" "OpeningSource" NOT NULL DEFAULT 'CREDIT';
UPDATE "BoosterOpening" SET "source" = CASE
    WHEN "sealedDropId" IS NOT NULL THEN 'SEALED'::"OpeningSource"
    WHEN "zeniSpent" > 0 THEN 'PAID'::"OpeningSource"
    ELSE 'FREE'::"OpeningSource"
END;

-- Joueur : date du rattachement v2 (verrous de transfert), code perso, arbre des liens masqué
ALTER TABLE "User" ADD COLUMN "referredAt" TIMESTAMP(3),
    ADD COLUMN "vanityCode" VARCHAR(16),
    ADD COLUMN "referralTreeHidden" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_vanityCode_key" ON "User"("vanityCode");
-- Code perso disjoint des codes standard (8 caractères sans 0/O/1/I) : un code ne désigne jamais deux comptes
ALTER TABLE "User" ADD CONSTRAINT "User_vanityCode_check" CHECK (
    "vanityCode" IS NULL OR ("vanityCode" ~ '^[A-Z0-9]{4,16}$' AND "vanityCode" !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$')
);

-- Parrainage : version, étapes, confiance, blocage, score, décision, révocation, grand-parrain, édition de l'Ennichi
ALTER TABLE "Referral" ADD COLUMN "version" SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN "step1At" TIMESTAMP(3),
    ADD COLUMN "step2At" TIMESTAMP(3),
    ADD COLUMN "step3At" TIMESTAMP(3),
    ADD COLUMN "step4At" TIMESTAMP(3),
    ADD COLUMN "discordCreatedAt" TIMESTAMP(3),
    ADD COLUMN "heldAt" TIMESTAMP(3),
    ADD COLUMN "holdReason" "ReferralHoldReason",
    ADD COLUMN "holdEvidence" JSONB,
    ADD COLUMN "score" INTEGER,
    ADD COLUMN "scoredAt" TIMESTAMP(3),
    ADD COLUMN "reviewedAt" TIMESTAMP(3),
    ADD COLUMN "reviewedById" TEXT,
    ADD COLUMN "reviewDecision" "ReferralDecision",
    ADD COLUMN "revokedAt" TIMESTAMP(3),
    ADD COLUMN "grandReferrerId" TEXT,
    ADD COLUMN "ennichiEdition" INTEGER;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_version_check" CHECK ("version" IN (1, 2));
-- En v2, une étape exige la précédente, sauf l'étape 4 qui peut suivre une étape 3 manquée
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_steps_check" CHECK (
    "version" = 1 OR (
        ("step2At" IS NULL OR "step1At" IS NOT NULL)
        AND ("step3At" IS NULL OR "step2At" IS NOT NULL)
        AND ("step4At" IS NULL OR "step2At" IS NOT NULL)
    )
);
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_hold_check" CHECK (("heldAt" IS NULL) = ("holdReason" IS NULL));
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_review_check" CHECK (("reviewedAt" IS NULL) = ("reviewDecision" IS NULL));
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_revoke_check" CHECK (
    ("revokedAt" IS NULL) = ("reviewDecision" IS NULL OR "reviewDecision" = 'VALIDATED')
);
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_score_check" CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_ennichi_check" CHECK ("ennichiEdition" IS NULL OR "ennichiEdition" >= 1);
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_grandReferrerId_fkey" FOREIGN KEY ("grandReferrerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- L'étape 2 remplace la qualification v1 : un ami qualifié compte comme installé pour les paliers v2
UPDATE "Referral" SET "step2At" = "qualifiedAt" WHERE "qualifiedAt" IS NOT NULL;

CREATE INDEX "Referral_referrerId_step2At_idx" ON "Referral"("referrerId", "step2At");
CREATE INDEX "Referral_grandReferrer_set" ON "Referral"("grandReferrerId") WHERE "grandReferrerId" IS NOT NULL;
-- File « À vérifier » : bloqués sans décision
CREATE INDEX "Referral_held_open_idx" ON "Referral"("heldAt") WHERE "heldAt" IS NOT NULL AND "reviewedAt" IS NULL;
-- Cron horaire : parrainages v2 encore en cours
CREATE INDEX "Referral_v2_open_idx" ON "Referral"("createdAt") WHERE "version" = 2 AND "revokedAt" IS NULL AND "step4At" IS NULL;
CREATE INDEX "Referral_ennichi_referrer" ON "Referral"("ennichiEdition", "referrerId") WHERE "ennichiEdition" IS NOT NULL;

-- Versements du parrainage v2 : ce que chaque versement a donné (Zeni, crédits par type, sachets, exemplaires, bons).
-- Les index uniques empêchent tout double versement ; une ligne reprise libère son palier.
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referralId" TEXT,
    "userId" TEXT NOT NULL,
    "kind" "ReferralRewardKind" NOT NULL,
    "side" "ReferralSide",
    "step" SMALLINT,
    "milestone" INTEGER,
    "multiplier" SMALLINT NOT NULL DEFAULT 1,
    "lotId" TEXT,
    "granted" JSONB NOT NULL,
    "ennichiEdition" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clawedBackAt" TIMESTAMP(3),

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReferralReward_shape_check" CHECK (
        ("kind" = 'STEP' AND "side" IS NOT NULL AND "step" BETWEEN 1 AND 4 AND "milestone" IS NULL)
        OR ("kind" = 'TRUST_BONUS' AND "side" = 'REFERRER' AND "step" IN (1, 2) AND "milestone" IS NULL)
        OR ("kind" = 'MILESTONE' AND "side" IS NULL AND "step" IS NULL AND "milestone" >= 1)
        OR ("kind" = 'GRAND' AND "side" IS NULL AND "step" IS NULL AND "milestone" IS NULL)
    ),
    CONSTRAINT "ReferralReward_multiplier_check" CHECK ("multiplier" BETWEEN 1 AND 10),
    CONSTRAINT "ReferralReward_granted_check" CHECK (jsonb_typeof("granted") = 'object')
);
CREATE UNIQUE INDEX "ReferralReward_step_once" ON "ReferralReward"("referralId", "kind", "side", "step") WHERE "kind" IN ('STEP', 'TRUST_BONUS');
CREATE UNIQUE INDEX "ReferralReward_milestone_once" ON "ReferralReward"("userId", "milestone") WHERE "kind" = 'MILESTONE' AND "clawedBackAt" IS NULL;
CREATE UNIQUE INDEX "ReferralReward_grand_once" ON "ReferralReward"("referralId") WHERE "kind" = 'GRAND';
CREATE INDEX "ReferralReward_userId_createdAt_idx" ON "ReferralReward"("userId", "createdAt");
CREATE INDEX "ReferralReward_referralId_idx" ON "ReferralReward"("referralId");
CREATE INDEX "ReferralReward_createdAt_idx" ON "ReferralReward"("createdAt");
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Empreintes des filleuls (HMAC de l'id Discord, de l'e-mail normalisé) : filleul une seule fois par compte Discord et
-- par boîte e-mail, même après déliaison ou suppression du compte
CREATE TABLE "RefereeFingerprint" (
    "kind" "FingerprintKind" NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "referralId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefereeFingerprint_pkey" PRIMARY KEY ("kind", "hash"),
    CONSTRAINT "RefereeFingerprint_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "RefereeFingerprint" ADD CONSTRAINT "RefereeFingerprint_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bons : « Mythique au choix » et carte 1/1 ; le joueur choisit sa carte, le bon garde la carte et l'exemplaire créés
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "VoucherKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "cardId" TEXT,
    "userCardId" TEXT,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Voucher_used_check" CHECK (("usedAt" IS NULL) = ("cardId" IS NULL))
);
CREATE INDEX "Voucher_userId_usedAt_idx" ON "Voucher"("userId", "usedAt");
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_userCardId_fkey" FOREIGN KEY ("userCardId") REFERENCES "UserCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ambassadeurs proposés : créés seuls au palier, l'équipe accepte ou refuse ; une seule proposition ouverte par joueur
CREATE TABLE "AmbassadorProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "accepted" BOOLEAN,

    CONSTRAINT "AmbassadorProposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AmbassadorProposal_decision_check" CHECK (("decidedAt" IS NULL) = ("accepted" IS NULL)),
    CONSTRAINT "AmbassadorProposal_installed_check" CHECK ("installed" >= 0)
);
CREATE UNIQUE INDEX "AmbassadorProposal_userId_open" ON "AmbassadorProposal"("userId") WHERE "decidedAt" IS NULL;
CREATE INDEX "AmbassadorProposal_decidedAt_createdAt_idx" ON "AmbassadorProposal"("decidedAt", "createdAt");
ALTER TABLE "AmbassadorProposal" ADD CONSTRAINT "AmbassadorProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmbassadorProposal" ADD CONSTRAINT "AmbassadorProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
