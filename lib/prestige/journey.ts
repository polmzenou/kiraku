// Lectures sûres des photos JSON du prestige : parcours d'un exemplaire consacré (ConsecratedCard.journey) et
// héritières d'un cycle (PrestigeCycle.heirs). Une entrée illisible est ignorée, jamais devinée.

import { HERITAGE_LEVELS } from "./heritage";

export const OWNERSHIP_VIAS = ["DRAW", "REBIRTH", "AUCTION", "LISTING", "TRADE", "GIFT", "CASINO"] as const;
export type OwnershipViaKey = (typeof OWNERSHIP_VIAS)[number];

export type JourneyOwner = { ownerId: string | null; via: OwnershipViaKey; at: Date };
export type ParsedJourney = { owners: JourneyOwner[]; cycles: number[]; prestige: number };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isVia = (v: unknown): v is OwnershipViaKey => typeof v === "string" && (OWNERSHIP_VIAS as readonly string[]).includes(v);
const positiveInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

export function readJourney(raw: unknown): ParsedJourney {
  if (!isObject(raw)) return { owners: [], cycles: [], prestige: 0 };
  const owners = Array.isArray(raw.owners)
    ? raw.owners.flatMap((o): JourneyOwner[] => {
        if (!isObject(o) || !isVia(o.via) || typeof o.at !== "string") return [];
        const at = new Date(o.at);
        if (Number.isNaN(at.getTime())) return [];
        return [{ ownerId: typeof o.ownerId === "string" ? o.ownerId : null, via: o.via, at }];
      })
    : [];
  const cycles = Array.isArray(raw.cycles) ? [...new Set(raw.cycles.filter(positiveInt))].sort((a, b) => a - b) : [];
  return { owners, cycles, prestige: typeof raw.prestige === "number" && Number.isInteger(raw.prestige) && raw.prestige >= 0 ? raw.prestige : 0 };
}

export type CycleHeir = { userCardId: string; cardId: string; heritage: number; printing: number | null; serial: number | null };

export function readHeirs(raw: unknown): CycleHeir[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h): CycleHeir[] => {
    if (!isObject(h) || typeof h.userCardId !== "string" || typeof h.cardId !== "string" || !positiveInt(h.heritage)) return [];
    const engraved = positiveInt(h.printing) && positiveInt(h.serial);
    return [{ userCardId: h.userCardId, cardId: h.cardId, heritage: Math.min(h.heritage, HERITAGE_LEVELS), printing: engraved ? (h.printing as number) : null, serial: engraved ? (h.serial as number) : null }];
  });
}

/** « du cycle 1 au cycle 5 » : premier et dernier prestige qui ont gardé l'exemplaire, ou null. */
export function keptSpan(cycles: readonly number[]): { from: number; to: number } | null {
  return cycles.length > 0 ? { from: cycles[0], to: cycles[cycles.length - 1] } : null;
}
