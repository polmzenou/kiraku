// Export « Télécharger mes données » (droit d'accès et de portabilité). Fonction pure : le serveur
// lit les lignes, ce module ne garde que les champs listés ici. Un champ absent de ces listes (hash de
// mot de passe, jetons OAuth ou push, graine de combat…) ne peut donc jamais sortir, même si une
// requête le sélectionne par erreur.

export const EXPORT_FORMAT_VERSION = 1;

export const EXPORT_FIELDS = {
  profile: [
    "id",
    "username",
    "email",
    "emailVerified",
    "image",
    "isGuest",
    "locale",
    "coins",
    "boosterStock",
    "rankPoints",
    "role",
    "profileVisibility",
    "showCollection",
    "referralCode",
    "termsVersion",
    "discordLinkedAt",
    "discordJoinedAt",
    "v1WelcomeSeenAt",
    "deletionRequestedAt",
    "createdAt",
  ],
  linkedAccounts: ["provider", "providerAccountId"],
  cards: ["id", "cardId", "cardName", "rarity", "status", "obtainedAt"],
  discoveries: ["cardId", "cardName", "createdAt"],
  wishlist: ["cardId", "position", "createdAt"],
  showcase: ["position", "userCardId"],
  boosterCredits: ["boosterTypeId", "count"],
  openings: ["id", "boosterSlug", "catalogCardIds", "golden", "divine", "pityTriggered", "zeniSpent", "createdAt"],
  ledger: ["amount", "reason", "refId", "balanceAfter", "createdAt"],
  battles: ["id", "mode", "status", "side", "opponent", "won", "endReason", "rewardZeni", "pcDelta", "createdAt", "endedAt"],
  auctions: ["id", "cardId", "startPrice", "buyoutPrice", "finalPrice", "fee", "status", "createdAt", "endsAt"],
  bids: ["auctionId", "amount", "createdAt"],
  tradeListings: ["id", "cardId", "wants", "status", "createdAt", "expiresAt", "resolvedAt"],
  listingOffers: ["listingId", "cardId", "status", "createdAt", "resolvedAt"],
  friends: ["username", "status", "direction", "createdAt", "acceptedAt"],
  blocked: ["username", "createdAt"],
  gifts: ["direction", "kind", "cardId", "zeniSpent", "otherUsername", "createdAt"],
  missions: ["missionId", "periodKey", "claimedAt"],
  purchases: ["shopItemId", "currency", "amount", "status", "createdAt", "paidAt"],
  referrals: ["role", "status", "createdAt", "qualifiedAt"],
  seasons: ["seasonId", "finalPc", "peakPc", "peakTier", "games", "claimedAt"],
  review: ["rating", "body", "reply", "hidden", "createdAt", "updatedAt"],
  notifications: ["type", "refId", "readAt", "createdAt"],
  pushSubscriptions: ["endpoint", "createdAt", "lastSentAt"],
  dataRequests: ["kind", "status", "requestedAt", "dueAt", "processedAt"],
} as const;

export type ExportSection = keyof typeof EXPORT_FIELDS;
type Row = Record<string, unknown>;

export type ExportInput = { profile: Row; review: Row | null } & { [K in Exclude<ExportSection, "profile" | "review">]: readonly Row[] };

function pick(row: Row, fields: readonly string[]): Row {
  const out: Row = {};
  for (const f of fields) if (f in row) out[f] = row[f] instanceof Date ? (row[f] as Date).toISOString() : row[f];
  return out;
}

export type DataExport = {
  format: "kiraku-data-export";
  version: number;
  generatedAt: string;
} & { [K in ExportSection]: K extends "profile" | "review" ? Row | null : Row[] };

export function buildDataExport(input: ExportInput, now: Date): DataExport {
  const sections: Record<string, unknown> = {};
  for (const key of Object.keys(EXPORT_FIELDS) as ExportSection[]) {
    const fields = EXPORT_FIELDS[key];
    const value = input[key];
    if (key === "profile" || key === "review") {
      sections[key] = value ? pick(value as Row, fields) : null;
    } else {
      sections[key] = (value as readonly Row[]).map((r) => pick(r, fields));
    }
  }
  return {
    format: "kiraku-data-export",
    version: EXPORT_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    ...sections,
  } as DataExport;
}

/** Nom du fichier téléchargé : kiraku-donnees-AAAA-MM-JJ.json */
export function exportFileName(now: Date): string {
  return `kiraku-donnees-${now.toISOString().slice(0, 10)}.json`;
}
