-- Disposition de la vitrine du profil : grille (toute taille) ou mise en page à 8 cartes
CREATE TYPE "ShowcaseLayout" AS ENUM ('GRID', 'FEATURED_LEFT', 'FEATURED_L', 'TRIPTYCH', 'CHECKER');

ALTER TABLE "User" ADD COLUMN "showcaseLayout" "ShowcaseLayout" NOT NULL DEFAULT 'GRID';
