"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import type { CollectionItem } from "@/lib/collection/view";
import { loadCollectionPage } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

const DEBOUNCE_MS = 300;

/**
 * Choix d'une carte pour une case de la vitrine : sa propre collection (rareté décroissante),
 * avec recherche et « Voir plus ». Les cartes déjà exposées sont marquées (les choisir les déplace).
 */
export function ShowcasePicker({
  onClose,
  onPick,
  shownIds,
  title,
  pickLabel,
}: {
  onClose: () => void;
  onPick: (card: CollectionItem) => void;
  shownIds: ReadonlySet<string>;
  /** Titre et libellé d'une carte, quand le sélecteur sert à autre chose que la vitrine (cadeau). */
  title?: string;
  pickLabel?: (name: string) => string;
}) {
  const t = useTranslations("showcase");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const searchId = useId();

  // Réponse d'une requête : ignorée si une recherche plus récente est partie entre-temps
  const apply = useCallback((id: number, offset: number, res: Awaited<ReturnType<typeof loadCollectionPage>> | null) => {
    if (id !== request.current) return;
    setLoading(false);
    if (!res || !res.ok) {
      setFailed(true);
      return;
    }
    setItems((current) => (offset === 0 ? res.items : [...current, ...res.items]));
    setNextOffset(res.nextOffset);
  }, []);

  const fetchPage = useCallback(
    (query: string, offset: number) => {
      const id = ++request.current;
      return loadCollectionPage({ query: query ? { q: query } : {}, offset }).then(
        (res) => apply(id, offset, res),
        () => apply(id, offset, null),
      );
    },
    [apply],
  );

  const load = (query: string, offset: number) => {
    setLoading(true);
    setFailed(false);
    return fetchPage(query, offset);
  };

  // Le sélecteur n'est monté qu'une fois ouvert : on charge la première page
  useEffect(() => {
    void fetchPage("", 0);
  }, [fetchPage]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Sheet open onClose={onClose} title={title ?? t("pickTitle")} wide>
      <div className="flex gap-2">
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
          className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
      </div>

      {items.length === 0 && !loading && !failed ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("pickEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3">
          {items.map((item) => (
            <li key={item.cardId}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="relative block w-full rounded-[5px] text-left transition-transform active:scale-[0.97] motion-reduce:transition-none"
              >
                <Fuda
                  card={item}
                  series={item.series}
                  size="sm"
                  overlay={
                    shownIds.has(item.cardId) && (
                      <span className="absolute bottom-6 left-1 rounded-sm bg-kin px-1 text-[10px] font-bold text-sumi">{t("alreadyShown")}</span>
                    )
                  }
                />
                <span className="sr-only">{pickLabel ? pickLabel(item.name) : t("pick", { name: item.name })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="flex justify-center">
        {loading && <p className="text-sm text-text-muted">{t("loading")}</p>}
        {failed && (
          <Button type="button" onClick={() => void load(q.trim(), items.length === 0 ? 0 : (nextOffset ?? 0))}>
            {t("retry")}
          </Button>
        )}
        {!loading && !failed && nextOffset !== null && items.length > 0 && (
          <Button type="button" onClick={() => void load(q.trim(), nextOffset)}>
            {t("more")}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
