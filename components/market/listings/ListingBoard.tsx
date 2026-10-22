"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { SEARCH_MAX_LENGTH } from "@/lib/catalog/search";
import { LISTING_FILTERS, type ListingFilter } from "@/lib/market/listings";
import { loadListingsPageAction } from "@/server/actions/listings";
import type { ListingView } from "@/server/market/listings";
import { Button } from "../../ui/Button";
import { chipClasses } from "../../ui/Chip";
import { inputClass } from "../../ui/Field";
import { ListingCard } from "./ListingCard";
import { ListingComposer } from "./ListingComposer";

const DEBOUNCE_MS = 400;

/** Lien de l'onglet « Échanges » avec ses filtres (seulement ce qui diffère du défaut). */
export function listingsHref(filter: ListingFilter, q: string) {
  const s = new URLSearchParams({ onglet: "echanges" });
  if (filter !== "all") s.set("filtre", filter);
  if (q) s.set("q", q);
  return `/marche?${s.toString()}`;
}

/**
 * Onglet « Échanges » du Marché : « Proposer une carte », recherche, filtres (que je n'ai pas, que
 * je peux accepter, mes offres) et la liste des annonces ouvertes, paginée par « Voir plus ».
 */
export function ListingBoard({
  initial,
  nextCursor: initialCursor,
  filter,
  q: initialQ,
  guest,
  isAdmin,
  maxWants,
  allowOther,
}: {
  initial: ListingView[];
  nextCursor: string | null;
  filter: ListingFilter;
  q: string;
  guest: boolean;
  /** Le lecteur est admin : poubelle à côté des commentaires. */
  isAdmin: boolean;
  maxWants: number;
  allowOther: boolean;
}) {
  const t = useTranslations("listings");
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [extra, setExtra] = useState<ListingView[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchId = useId();

  // Nouvelle première page (filtre, recherche ou action validée) : on repart d'elle
  const [base, setBase] = useState(initial);
  if (base !== initial) {
    setBase(initial);
    setExtra([]);
    setCursor(initialCursor);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const seen = new Set(initial.map((l) => l.id));
  const items = [...initial, ...extra.filter((l) => !seen.has(l.id))];

  const more = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await loadListingsPageAction({ q: initialQ, filter, cursor });
        if (!res.ok) {
          setError(t(`errors.${res.error}` as "errors.UNAVAILABLE"));
          return;
        }
        setExtra((current) => [...current, ...res.items]);
        setCursor(res.nextCursor);
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
    });

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${searchId}-title`}>
      <div className="flex flex-col gap-1">
        <h2 id={`${searchId}-title`} className="font-title text-xl font-extrabold">
          {t("boardTitle")}
        </h2>
        <p className="text-sm text-text-muted">{t("boardIntro")}</p>
      </div>

      {!guest && (
        <Button type="button" variant="primary" className="self-start" onClick={() => setComposing(true)}>
          {t("create")}
        </Button>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
            timer.current = setTimeout(() => router.replace(listingsHref(filter, value.trim()), { scroll: false }), DEBOUNCE_MS);
          }}
          className={`${inputClass} md:max-w-sm`}
        />
        {!guest && (
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0" aria-label={t("filtersLabel")}>
            {LISTING_FILTERS.filter((f) => f !== "all").map((f) => {
              const active = filter === f;
              return (
                <li key={f}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => router.replace(listingsHref(active ? "all" : f, q.trim()), { scroll: false })}
                    className={chipClasses(active)}
                  >
                    {t(`filters.${f}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {items.length === 0 ? (
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t(`empty.${filter}`)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((listing) => (
            <li key={listing.id}>
              <ListingCard listing={listing} guest={guest} isAdmin={isAdmin} allowOther={allowOther} onChanged={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-shu">
          {error}
        </p>
      )}
      {cursor && (
        <Button type="button" onClick={more} disabled={pending} className="self-center">
          {pending ? t("loading") : t("more")}
        </Button>
      )}

      {composing && (
        <ListingComposer
          maxWants={maxWants}
          onClose={() => {
            setComposing(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
