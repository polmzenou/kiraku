"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CardView } from "@/lib/boosters/view";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { searchWantableCardsAction } from "@/server/actions/listings";
import { Fuda } from "../../fuda/Fuda";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/Field";

const DEBOUNCE_MS = 300;

/**
 * Grille des cartes du catalogue que le joueur n'a pas, pour choisir les cartes demandées d'une
 * annonce : recherche, « Voir plus », cartes cochées. Le serveur revérifie tout à la publication.
 */
export function WantPickGrid({
  selected,
  onPick,
}: {
  selected: ReadonlySet<string>;
  onPick: (card: CardView) => void;
}) {
  const t = useTranslations("listings.compose");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CardView[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const searchId = useId();

  const fetchPage = useCallback((query: string, offset: number) => {
    const id = ++request.current;
    return searchWantableCardsAction({ q: query, offset }).then(
      (res) => {
        if (id !== request.current) return;
        setLoading(false);
        if (!res.ok) {
          setError(true);
          return;
        }
        setItems((current) => (offset === 0 ? res.items : [...current, ...res.items]));
        setNextOffset(res.nextOffset);
      },
      () => {
        if (id !== request.current) return;
        setLoading(false);
        setError(true);
      },
    );
  }, []);

  const load = (query: string, offset: number) => {
    setLoading(true);
    setError(false);
    return fetchPage(query, offset);
  };

  useEffect(() => {
    void fetchPage("", 0);
  }, [fetchPage]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={searchId} className="sr-only">
        {t("searchLabel")}
      </label>
      <input
        id={searchId}
        type="search"
        value={q}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        onChange={(e) => {
          const value = e.currentTarget.value;
          setQ(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void load(value.trim(), 0), DEBOUNCE_MS);
        }}
        className={inputClass}
      />

      {items.length === 0 && !loading && !error ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("wantEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3">
          {items.map((item) => {
            const checked = selected.has(item.cardId);
            return (
              <li key={item.cardId}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => onPick(item)}
                  className="relative block w-full rounded-fuda text-left outline-offset-2 transition-transform active:scale-[0.97] aria-pressed:outline-3 aria-pressed:outline-shu motion-reduce:transition-none"
                >
                  <Fuda card={item} series={item.series} size="sm" tilt={false} />
                  <span className="sr-only">{t("pickWanted", { card: item.name })}</span>
                  {checked && (
                    <span aria-hidden="true" className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-shu text-sm font-bold text-washi-paper shadow-raised">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div aria-live="polite" className="flex justify-center">
        {loading && <p className="text-sm text-text-muted">{t("loading")}</p>}
        {error && (
          <Button type="button" onClick={() => void load(q.trim(), items.length === 0 ? 0 : (nextOffset ?? 0))}>
            {t("retry")}
          </Button>
        )}
        {!loading && !error && nextOffset !== null && items.length > 0 && (
          <Button type="button" onClick={() => void load(q.trim(), nextOffset)}>
            {t("more")}
          </Button>
        )}
      </div>
    </div>
  );
}
