import { useTranslations } from "next-intl";
import type { FilterContext } from "@/lib/boosters/pool-filter";
import type { BoosterTypeView } from "@/lib/boosters/types";

/** Filtre AniList d'un type, en clair : « Tag Shounen », « Œuvres depuis 2018 », « Nés aujourd'hui »… */
export function FilterText({ type, ctx }: { type: Pick<BoosterTypeView, "filter" | "kind" | "featuredCardIds">; ctx: FilterContext }) {
  const t = useTranslations("boosters.filterText");
  const tSeason = useTranslations("boosters.seasons");
  const f = type.filter ?? {};
  const parts: string[] = [];

  if (f.tags) parts.push(t("tags", { list: f.tags.join(", ") }));
  if (f.genres) parts.push(t("genres", { list: f.genres.join(", ") }));
  if (f.gender === "Female") parts.push(t("female"));
  if (f.gender === "Male") parts.push(t("male"));
  if (f.role === "MAIN") parts.push(t("main"));
  if (f.role === "SUPPORTING") parts.push(t("supporting"));
  if (f.yearMin !== undefined && f.yearMax !== undefined) parts.push(t("yearRange", { min: f.yearMin, max: f.yearMax }));
  else if (f.yearMax !== undefined) parts.push(t("yearMax", { max: f.yearMax + 1 }));
  else if (f.yearMin !== undefined) parts.push(t("yearMin", { min: f.yearMin }));
  if (f.currentSeason) parts.push(t("currentSeason", { season: tSeason(ctx.season), year: ctx.seasonYear }));
  if (f.birthdayToday) parts.push(t("birthday"));
  if (f.studio) parts.push(t("studio", { studio: f.studio }));
  if (f.mediaType === "MANGA") parts.push(t("manga"));
  if (f.mediaType === "ANIME") parts.push(t("anime"));
  if (f.seriesIds) parts.push(t("series", { count: f.seriesIds.length }));
  if (f.cardIds) parts.push(t("cards", { count: f.cardIds.length }));
  if (type.featuredCardIds.length > 0) parts.push(t("featured", { count: type.featuredCardIds.length }));

  if (parts.length === 0) return <>{type.kind === "RARITY" ? t("raised") : t("none")}</>;
  return <>{parts.join(" · ")}</>;
}
