import "server-only";
import { unstable_cache } from "next/cache";
import { seriesTitle } from "@/lib/catalog/display";
import { prisma } from "../db";
import { BOOSTER_TYPES_TAG } from "./pools";

const loadTitles = unstable_cache(
  async (ids: number[]) =>
    prisma.series.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleEnglish: true } }),
  ["focus-series-titles"],
  { tags: [BOOSTER_TYPES_TAG], revalidate: 3600 },
);

/** Titres des œuvres d'un Focus série dans la langue du joueur, dans l'ordre choisi par l'admin. */
export async function focusSeriesTitles(ids: readonly number[], locale: string): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await loadTitles([...ids]);
  const byId = new Map(rows.map((r) => [r.anilistId, seriesTitle(r, locale)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
