import type { BaseRarity } from "@/lib/catalog/rarity";

// Import Kyara (étape 17) : codes de rareté de Kyara (C à M) et leur rareté de base chez nous, statuts d'une
// demande et motifs de refus. L'identifiant d'une carte Kyara est l'identifiant AniList du personnage, donc
// notre Card.anilistId (cartes de base seulement).

export const KYARA_ORIGIN = "https://kyara.games";
export const KYARA_HOST = "kyara.games";

export const KYARA_CODES = ["C", "U", "R", "E", "L", "M"] as const;
export type KyaraCode = (typeof KYARA_CODES)[number];

export const KYARA_BASE_RARITY: Readonly<Record<KyaraCode, BaseRarity>> = {
  C: "COMMON",
  U: "UNCOMMON",
  R: "RARE",
  E: "EPIC",
  L: "LEGENDARY",
  M: "MYTHIC",
};

export function isKyaraCode(value: unknown): value is KyaraCode {
  return typeof value === "string" && (KYARA_CODES as readonly string[]).includes(value);
}

/** Statuts d'une demande ; seules PENDING, READY et DONE verrouillent le compte, le Discord ou le profil Kyara. */
export const KYARA_IMPORT_STATUSES = ["PENDING", "READY", "DONE", "REJECTED", "CANCELLED"] as const;
export type KyaraImportStatus = (typeof KYARA_IMPORT_STATUSES)[number];

/** Motifs de refus : liste fermée, traduite pour le joueur ; la note libre de l'équipe s'y ajoute. */
export const KYARA_REJECT_CODES = [
  "NOT_FRIEND",
  "COLLECTION_HIDDEN",
  "PROFILE_NOT_FOUND",
  "DISCORD_MISMATCH",
  "ALREADY_IMPORTED",
  "SUSPECT",
  "OTHER",
] as const;
export type KyaraRejectCode = (typeof KYARA_REJECT_CODES)[number];

export function isKyaraRejectCode(value: unknown): value is KyaraRejectCode {
  return typeof value === "string" && (KYARA_REJECT_CODES as readonly string[]).includes(value);
}

/** Version du format du lot envoyé par le favori (lib/kyara/payload.ts). */
export const KYARA_PAYLOAD_VERSION = 2;

/**
 * Pourquoi une collection lue attend l'équipe (READY) au lieu d'être versée tout de suite : avatar Kyara sans ID
 * Discord (demande choisie à la main), rien de lu, moins de personnages lus qu'annoncés par Kyara.
 */
export const KYARA_REVIEW_REASONS = ["DISCORD_UNVERIFIED", "EMPTY", "TRUNCATED"] as const;
export type KyaraReviewReason = (typeof KYARA_REVIEW_REASONS)[number];

export function isKyaraReviewReason(value: unknown): value is KyaraReviewReason {
  return typeof value === "string" && (KYARA_REVIEW_REASONS as readonly string[]).includes(value);
}

/** Sceau de l'import (越 : passer de l'autre côté), dans le sous-ensemble Yuji Syuku (lib/seal-glyphs.ts). */
export const KYARA_SEAL = "越";
