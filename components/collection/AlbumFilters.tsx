"use client";

import { useTranslations } from "next-intl";
import { useId, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { ALBUM_SORTS, albumQuery, type AlbumParams } from "@/lib/collection/albums";
import { chipClasses } from "../ui/Chip";
import { inputClass } from "../ui/Field";
import { segmentedItemClass, segmentedTrackClass } from "../ui/Segmented";

/** Recherche, portée (commencés ou tous) et tri des albums ; tout passe par l'URL. */
export function AlbumFilters({ params, total }: { params: AlbumParams; total: number }) {
  const t = useTranslations("collection.albums");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const searchId = useId();

  const go = (next: Partial<AlbumParams>) =>
    startTransition(() => router.replace({ pathname: "/collection", query: albumQuery({ ...params, ...next }) }, { scroll: false }));

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
        }}
      >
        <label htmlFor={searchId} className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id={searchId}
          name="q"
          type="search"
          defaultValue={params.q}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={t("searchPlaceholder")}
          enterKeyHint="search"
          className={`${inputClass} md:max-w-md`}
        />
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-text-muted tabular-nums">{t("count", { count: total })}</p>
          <button type="button" aria-pressed={params.all} onClick={() => go({ all: !params.all })} className={chipClasses(params.all)}>
            {t("showAll")}
          </button>
        </div>
        <div role="group" aria-label={t("sortLabel")} className={`${segmentedTrackClass} overflow-x-auto [scrollbar-width:none]`}>
          {ALBUM_SORTS.map((sort) => (
            <button
              key={sort}
              type="button"
              aria-pressed={params.sort === sort}
              onClick={() => go({ sort })}
              className={segmentedItemClass}
            >
              {t(`sorts.${sort}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
