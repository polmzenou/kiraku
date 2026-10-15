import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { BoosterType as BoosterTypeRow } from "@/generated/prisma/client";
import { groupByRarity, poolCounts, poolSize, type CardPool } from "@/lib/boosters/draw";
import { dayKey, filterContext, isDynamicFilter, type FilterContext } from "@/lib/boosters/pool-filter";
import {
  isRotatingFamily,
  ROTATING_FAMILIES,
  rotationSelection,
  rotationWindow,
  type RotatingFamily,
  type RotationPick,
  type RotationWindow,
} from "@/lib/boosters/rotation";
import { availability, type Availability, type BoosterTypeView } from "@/lib/boosters/types";
import { RARITIES, type Rarity } from "@/lib/catalog/rarity";
import { getCatalogVersion } from "../catalog/queries";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { computePool, loadCandidates, toBoosterTypeView } from "./type-store";

// Types de boosters et leurs pools, en cache. Un tirage n'est qu'une lecture en mémoire :
// - pools statiques : ids enregistrés en base (recalculés à l'import, au seed et par l'admin) ;
// - pools du jour (anniversaires, saison en cours) : calculés une fois par jour depuis le catalogue.
// Les écritures de l'admin appellent revalidateTag(BOOSTER_TYPES_TAG).

export const BOOSTER_TYPES_TAG = "booster-types";

type TypeRow = Omit<BoosterTypeRow, "poolCardIds">;

/** unstable_cache sérialise en JSON : les dates reviennent en chaînes. */
const DATE_FIELDS = ["startsAt", "endsAt", "poolComputedAt", "createdAt", "updatedAt"] as const;
function revive(row: TypeRow): TypeRow {
  const out = { ...row };
  for (const k of DATE_FIELDS) {
    const v = out[k] as unknown;
    if (typeof v === "string") (out as Record<string, unknown>)[k] = new Date(v);
  }
  return out;
}

// La version du catalogue est dans la clé : un import lancé par script est vu tout de suite
const loadTypeRows = unstable_cache(
  async (_catalogVersion: number) =>
    prisma.boosterType.findMany({ omit: { poolCardIds: true }, orderBy: [{ family: "asc" }, { sortOrder: "asc" }] }),
  ["booster-types"],
  { tags: [BOOSTER_TYPES_TAG], revalidate: 3600 },
);

export type BoosterTypeEntry = {
  type: BoosterTypeView;
  /** Pool enregistré (instantané du dernier recalcul). */
  storedCounts: Record<Rarity, number> | null;
  /** Change à chaque modification du type ou recalcul de son pool : clé de cache du pool. */
  stamp: number;
  dynamic: boolean;
};

function parseCounts(raw: unknown): Record<Rarity, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return Object.fromEntries(RARITIES.map((k) => [k, typeof r[k] === "number" ? (r[k] as number) : 0])) as Record<Rarity, number>;
}

/** Tous les types (actifs ou non), dans l'ordre des familles. Lu une fois par requête. */
export const getBoosterTypes = cache(async (): Promise<BoosterTypeEntry[]> => {
  const rows = (await loadTypeRows(await getCatalogVersion())).map(revive);
  return rows.map((row) => {
    const type = toBoosterTypeView(row);
    return {
      type,
      storedCounts: parseCounts(row.poolCounts),
      stamp: Math.max(row.updatedAt.getTime(), row.poolComputedAt?.getTime() ?? 0),
      dynamic: type.filter !== null && isDynamicFilter(type.filter),
    };
  });
});

export async function getBoosterTypeEntry(slug: string): Promise<BoosterTypeEntry | null> {
  return (await getBoosterTypes()).find((e) => e.type.slug === slug) ?? null;
}

/** Date du jour et saison en cours dans le fuseau du jeu. */
export const getFilterContext = cache(async (): Promise<FilterContext> => filterContext(new Date(), await getSetting("game.timeZone")));

const loadStaticPool = unstable_cache(
  async (slug: string, _stamp: number): Promise<CardPool> => {
    const row = await prisma.boosterType.findUnique({ where: { slug }, select: { poolCardIds: true } });
    if (!row || row.poolCardIds.length === 0) return groupByRarity([]);
    const cards = await prisma.card.findMany({
      where: { id: { in: row.poolCardIds }, rank: { not: null } },
      select: { id: true, rarity: true },
      orderBy: { rank: "asc" },
    });
    return groupByRarity(cards.map((c) => ({ id: c.id, rarity: c.rarity as Rarity })));
  },
  ["booster-pool-static"],
  { tags: [BOOSTER_TYPES_TAG], revalidate: 3600 },
);

const loadDailyPool = unstable_cache(
  async (slug: string, _stamp: number, _catalogVersion: number, _day: string): Promise<CardPool> => {
    const entry = await getBoosterTypeEntry(slug);
    if (!entry) return groupByRarity([]);
    return computePool(entry.type, await loadCandidates(prisma), await getFilterContext());
  },
  ["booster-pool-daily"],
  { tags: [BOOSTER_TYPES_TAG], revalidate: 3600 },
);

/** Pool d'un type, groupé par rareté (rareté globale du catalogue). */
export async function getBoosterPool(entry: BoosterTypeEntry): Promise<CardPool> {
  if (!entry.dynamic) return loadStaticPool(entry.type.slug, entry.stamp);
  const [version, ctx] = await Promise.all([getCatalogVersion(), getFilterContext()]);
  return loadDailyPool(entry.type.slug, entry.stamp, version, dayKey(ctx));
}

export type BoosterOffer = {
  type: BoosterTypeView;
  counts: Record<Rarity, number>;
  size: number;
  availability: Availability;
  /** Familles tournantes : proposé dans la sélection en cours, ou au repos (caché). */
  rotation: "featured" | "resting" | null;
};

export type BoosterRotation = {
  window: RotationWindow;
  hours: number;
  /** Types qui seraient proposés sans rotation, dans l'ordre d'affichage. */
  candidates: Record<RotatingFamily, string[]>;
  selection: Record<RotatingFamily, RotationPick>;
};

type BaseOffer = Omit<BoosterOffer, "rotation">;

const loadBaseOffers = cache(async (): Promise<BaseOffer[]> => {
  const [entries, minPool] = await Promise.all([getBoosterTypes(), getSetting("booster.minPool")]);
  const now = new Date();
  return Promise.all(
    entries.map(async (entry) => {
      const counts = entry.dynamic || !entry.storedCounts ? poolCounts(await getBoosterPool(entry)) : entry.storedCounts;
      const size = RARITIES.reduce((s, r) => s + counts[r], 0);
      return { type: entry.type, counts, size, availability: availability(entry.type, now, size, entry.type.minPoolSize ?? minPool) };
    }),
  );
});

/** Sélection en cours des familles « Par démographie » et « Par genre » (même résultat sur tous les serveurs). */
export const getBoosterRotation = cache(async (): Promise<BoosterRotation> => {
  const [offers, hours, timeZone, demographie, genre, pin] = await Promise.all([
    loadBaseOffers(),
    getSetting("booster.rotationHours"),
    getSetting("game.timeZone"),
    getSetting("booster.rotationDemographie"),
    getSetting("booster.rotationGenre"),
    getSetting("booster.rotationPin"),
  ]);
  const window = rotationWindow(new Date(), hours, timeZone);
  const candidates = Object.fromEntries(
    ROTATING_FAMILIES.map((f) => [f, offers.filter((o) => o.type.family === f && o.availability !== "hidden").map((o) => o.type.slug)]),
  ) as Record<RotatingFamily, string[]>;
  const selection = rotationSelection({ candidates, counts: { demographie, genre }, window: window.index, hours, pin });
  return { window, hours, candidates, selection };
});

/** Ce que la page propose : chaque type avec la taille de son pool du jour et sa disponibilité. */
export const getBoosterOffers = cache(async (): Promise<BoosterOffer[]> => {
  const [offers, rotation] = await Promise.all([loadBaseOffers(), getBoosterRotation()]);
  return offers.map((offer) => {
    const family = offer.type.family;
    if (!isRotatingFamily(family) || offer.availability === "hidden") return { ...offer, rotation: null };
    // Hors de la sélection en cours : caché comme un type inactif (ni affiché, ni ouvrable hors crédit)
    return rotation.selection[family].slugs.includes(offer.type.slug)
      ? { ...offer, rotation: "featured" as const }
      : { ...offer, availability: "hidden" as const, rotation: "resting" as const };
  });
});

export { poolSize };
