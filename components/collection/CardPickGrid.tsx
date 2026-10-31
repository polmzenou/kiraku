"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Fuda } from "@/components/fuda/Fuda";
import type { Rarity } from "@/lib/catalog/rarity";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { pickerQuery } from "@/lib/collection/params";
import type { CollectionItem } from "@/lib/collection/view";
import { loadCollectionPage } from "@/server/actions/collection";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import { OwnedBadge } from "./OwnedBadge";
import { RarityChips } from "./RarityChips";

const DEBOUNCE_MS = 300;

/**
 * Grille de cartes à choisir dans une collection (la sienne, ou celle d'un joueur dont le profil
 * l'autorise) : recherche, raretés, « Voir plus », cartes cochées. Le serveur revérifie tout ensuite.
 */
export function CardPickGrid({
  username,
  selected,
  onPick,
  pickLabel,
  disabled,
  unavailable,
  allowed,
}: {
  /** Collection d'un autre joueur ; absent = la sienne. */
  username?: string;
  selected: ReadonlySet<string>;
  onPick: (card: CollectionItem) => void;
  pickLabel: (name: string) => string;
  /** Cartes impossibles à choisir (ex. la carte demandée, quand on choisit les siennes). */
  disabled?: ReadonlySet<string>;
  /** Cartes grisées selon leurs données (ex. aucun exemplaire libre pour une vente). */
  unavailable?: (card: CollectionItem) => boolean;
  /** Raretés acceptées par le serveur pour cet usage : les autres ne sont ni proposées ni listées. */
  allowed?: readonly Rarity[];
}) {
  const t = useTranslations("showcase");
  const [q, setQ] = useState("");
  const [rarities, setRarities] = useState<Rarity[]>([]);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"FORBIDDEN" | "OTHER" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const searchId = useId();

  const allowedKey = allowed?.join(",");
  const fetchPage = useCallback(
    (query: string, picked: readonly Rarity[], offset: number) => {
      const id = ++request.current;
      const only = allowedKey === undefined ? undefined : allowedKey.split(",").filter(Boolean);
      return loadCollectionPage({ ...(username ? { username } : {}), query: pickerQuery(query, picked, only), offset }).then(
        (res) => {
          if (id !== request.current) return;
          setLoading(false);
          if (!res.ok) {
            setError(res.error === "FORBIDDEN" ? "FORBIDDEN" : "OTHER");
            return;
          }
          setItems((current) => (offset === 0 ? res.items : [...current, ...res.items]));
          setNextOffset(res.nextOffset);
        },
        () => {
          if (id !== request.current) return;
          setLoading(false);
          setError("OTHER");
        },
      );
    },
    [username, allowedKey],
  );

  const load = (query: string, picked: readonly Rarity[], offset: number) => {
    setLoading(true);
    setError(null);
    return fetchPage(query, picked, offset);
  };

  useEffect(() => {
    void fetchPage("", [], 0);
  }, [fetchPage]);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (error === "FORBIDDEN") return <p className="py-6 text-center text-sm text-text-muted">{t("privateCollection")}</p>;

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
          timer.current = setTimeout(() => void load(value.trim(), rarities, 0), DEBOUNCE_MS);
        }}
        className={inputClass}
      />
      <RarityChips
        value={rarities}
        allowed={allowed}
        onChange={(next) => {
          clearTimeout(timer.current);
          setRarities(next);
          void load(q.trim(), next, 0);
        }}
      />

      {items.length === 0 && !loading && !error ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("pickEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3">
          {items.map((item) => {
            const checked = selected.has(item.cardId);
            const off = (disabled?.has(item.cardId) ?? false) || (unavailable?.(item) ?? false);
            return (
              <li key={item.cardId}>
                <button
                  type="button"
                  aria-pressed={checked}
                  disabled={off}
                  onClick={() => onPick(item)}
                  className="relative block w-full rounded-fuda text-left outline-offset-2 transition-transform active:scale-[0.97] disabled:opacity-40 aria-pressed:outline-3 aria-pressed:outline-shu motion-reduce:transition-none"
                >
                  <Fuda
                    card={item}
                    series={item.series}
                    size="sm"
                    tilt={false}
                    corner={item.viewerOwns && <OwnedBadge />}
                  />
                  <span className="sr-only">{pickLabel(item.name)}</span>
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
        {error === "OTHER" && (
          <Button type="button" onClick={() => void load(q.trim(), rarities, items.length === 0 ? 0 : (nextOffset ?? 0))}>
            {t("retry")}
          </Button>
        )}
        {!loading && !error && nextOffset !== null && items.length > 0 && (
          <Button type="button" onClick={() => void load(q.trim(), rarities, nextOffset)}>
            {t("more")}
          </Button>
        )}
      </div>
    </div>
  );
}
