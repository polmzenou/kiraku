// Notifications : types connus et pastille de la cloche.

export const NOTIFICATION_TYPES = ["FRIEND_REQUEST", "FRIEND_ACCEPTED", "GIFT_RECEIVED"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Texte de la pastille : rien à 0, « 9+ » au-delà de 9. */
export function formatBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** Contenu d'une notification de cadeau (ids et nombres seulement). */
export type GiftPayload = { kind: "CARD"; cardId: string } | { kind: "BOOSTER" };

export function parseGiftPayload(raw: unknown): GiftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "BOOSTER") return { kind: "BOOSTER" };
  if (r.kind === "CARD" && typeof r.cardId === "string" && r.cardId.length <= 40) return { kind: "CARD", cardId: r.cardId };
  return null;
}
