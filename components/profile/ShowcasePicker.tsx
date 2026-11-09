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
import { Sheet } from "../ui/Sheet";
import { RarityChips } from "../collection/RarityChips";

const DEBOUNCE_MS = 300;

/**
 * Choix d'une carte pour une case de la vitrine : sa propre collection (rareté décroissante),
 * avec recherche, raretés et « Voir plus ». Les cartes déjà exposées sont marquées (les choisir les déplace).
 * `multiple` : plusieurs cartes d'un coup (jusqu'à `max`), validées ensemble ; celles déjà exposées
 * ne se choisissent pas.
 */
export function ShowcasePicker({
  onClose,
  onPick,
  shownIds,
  title,
  pickLabel,
  allowed,
  multiple,
}: {
  onClose: () => void;
  onPick?: (card: CollectionItem) => void;
  shownIds: ReadonlySet<string>;
  /** Titre et libellé d'une carte, quand le sélecteur sert à autre chose que la vitrine (cadeau). */
  title?: string;
  pickLabel?: (name: string) => string;
  /** Raretés acceptées par le serveur (cadeau) : les autres ne sont ni proposées ni listées. */
  allowed?: readonly Rarity[];
  multiple?: { max: number; onConfirm: (cards: CollectionItem[]) => void };
}) {
  const t = useTranslations("showcase");
  const [chosen, setChosen] = useState<CollectionItem[]>([]);
  const toggle = (item: CollectionItem) =>
    setChosen((list) =>
      list.some((c) => c.cardId === item.cardId)
        ? list.filter((c) => c.cardId !== item.cardId)
        : multiple && list.length < multiple.max
          ? [...list, item]
          : list,
    );
  const [q, setQ] = useState("");
  const [rarities, setRarities] = useState<Rarity[]>([]);
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

  const allowedKey = allowed?.join(",");
  const fetchPage = useCallback(
    (query: string, picked: readonly Rarity[], offset: number) => {
      const id = ++request.current;
      const only = allowedKey === undefined ? undefined : allowedKey.split(",").filter(Boolean);
      return loadCollectionPage({ query: pickerQuery(query, picked, only), offset }).then(
        (res) => apply(id, offset, res),
        () => apply(id, offset, null),
      );
    },
    [apply, allowedKey],
  );

  const load = (query: string, picked: readonly Rarity[], offset: number) => {
    setLoading(true);
    setFailed(false);
    return fetchPage(query, picked, offset);
  };

  // Le sélecteur n'est monté qu'une fois ouvert : on charge la première page
  useEffect(() => {
    void fetchPage("", [], 0);
  }, [fetchPage]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Sheet open onClose={onClose} title={title ?? (multiple ? t("picker.multiTitle") : t("pickTitle"))} wide>
      {multiple && <p className="text-sm text-text-muted">{t("picker.free", { count: multiple.max })}</p>}
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
            timer.current = setTimeout(() => void load(value.trim(), rarities, 0), DEBOUNCE_MS);
          }}
          className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
      </div>
      <RarityChips
        value={rarities}
        allowed={allowed}
        onChange={(next) => {
          clearTimeout(timer.current);
          setRarities(next);
          void load(q.trim(), next, 0);
        }}
      />

      {items.length === 0 && !loading && !failed ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("pickEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3">
          {items.map((item) => {
            const shown = shownIds.has(item.cardId);
            const selected = chosen.some((c) => c.cardId === item.cardId);
            return (
            <li key={item.cardId}>
              <button
                type="button"
                onClick={() => (multiple ? toggle(item) : onPick?.(item))}
                disabled={Boolean(multiple) && shown}
                aria-pressed={multiple ? selected : undefined}
                className={`relative block w-full rounded-[5px] text-left transition-transform active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none ${selected ? "ring-2 ring-shu ring-offset-2 ring-offset-bg" : ""}`}
              >
                <Fuda
                  card={item}
                  series={item.series}
                  size="sm"
                  overlay={
                    shown && (
                      <span className="absolute bottom-6 left-1 rounded-sm bg-kin px-1 text-[10px] font-bold text-sumi">{t("alreadyShown")}</span>
                    )
                  }
                />
                <span className="sr-only">{pickLabel ? pickLabel(item.name) : t("pick", { name: item.name })}</span>
              </button>
            </li>
            );
          })}
        </ul>
      )}

      <div aria-live="polite" className="flex justify-center">
        {loading && <p className="text-sm text-text-muted">{t("loading")}</p>}
        {failed && (
          <Button type="button" onClick={() => void load(q.trim(), rarities, items.length === 0 ? 0 : (nextOffset ?? 0))}>
            {t("retry")}
          </Button>
        )}
        {!loading && !failed && nextOffset !== null && items.length > 0 && (
          <Button type="button" onClick={() => void load(q.trim(), rarities, nextOffset)}>
            {t("more")}
          </Button>
        )}
      </div>

      {multiple && (
        <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t border-border bg-surface px-1 pt-3">
          <span className="text-sm tabular-nums text-text-muted" aria-live="polite">
            {t("picker.counter", { count: chosen.length, max: multiple.max })}
          </span>
          <Button type="button" variant="primary" disabled={chosen.length === 0} onClick={() => multiple.onConfirm(chosen)}>
            {chosen.length === 0 ? t("picker.chooseHint") : t("picker.confirm", { count: chosen.length })}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
