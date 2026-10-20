import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { parseAppearance } from "@/lib/catalog/appearance";
import type { RarityDefinition } from "@/lib/catalog/definitions";
import { prisma } from "../db";

export const RARITIES_TAG = "catalog-rarities";
export const getRarityDefinitions = cache(unstable_cache(async (): Promise<RarityDefinition[]> => {
  const rows = await prisma.rarityDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    select: { key: true, nameFr: true, nameEn: true, sortOrder: true, seal: true, appearance: true, variantRequired: true, updatedAt: true } });
  return rows.map((r) => ({ ...r, appearance: parseAppearance(r.appearance), updatedAt: r.updatedAt.toISOString() }));
}, ["catalog-rarities"], { tags: [RARITIES_TAG], revalidate: 3600 }));
export async function getRarities() { return (await getRarityDefinitions()).map((r) => r.key); }

export async function getRaritySeals() { return Object.fromEntries((await getRarityDefinitions()).map((r) => [r.key, r.seal])); }
