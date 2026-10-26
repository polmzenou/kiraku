"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { familyRows, searchEntries } from "@/lib/boosters/showcase";
import type { BoosterFamily } from "@/lib/boosters/types";
import { BoosterComposition, WishlistSummary } from "../BoosterPanel";
import { BoosterRow } from "./ShowcaseRow";
import type { Entry, ShowcaseFamily } from "./types";

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const t = useTranslations("boosters.showcase");
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {t("search")}
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full rounded-control border border-border bg-bg pr-3 pl-10 text-base text-text placeholder:text-text-muted sm:text-sm"
      />
    </div>
  );
}

type ListProps = {
  entries: Entry[];
  families: ShowcaseFamily[];
  family: BoosterFamily;
  query: string;
  onQuery: (query: string) => void;
  selected: Entry;
  onSelect: (slug: string) => void;
  stock: number;
  rotationNote: string;
};

/** Colonne de droite (desktop) : recherche, boosters de la famille ou résultats, composition et souhaits. */
export function ShowcaseList({ entries, families, family, query, onQuery, selected, onSelect, stock, rotationNote }: ListProps) {
  const t = useTranslations("boosters.showcase");
  const tb = useTranslations("boosters");
  const headingId = useId();
  const fam = families.find((f) => f.family === family) ?? families[0];
  const titleOf = (f: BoosterFamily) => families.find((x) => x.family === f)?.title ?? f;

  let title: string;
  let count: string;
  let sub: string;
  let on: Entry[];
  let off: Entry[] = [];
  if (query.trim()) {
    on = searchEntries(entries, query, titleOf);
    title = t("results");
    count = t("count", { count: on.length });
    sub = t("resultsHint");
  } else {
    ({ on, off } = familyRows(entries, family));
    title = fam.title;
    count = fam.rotating ? t("rotatingCount", { on: on.length, total: on.length + off.length }) : t("count", { count: on.length });
    sub = fam.rotating ? `${fam.subtitle} · ${rotationNote}` : fam.subtitle;
  }
  const subOf = (e: Entry) => (query.trim() ? `${titleOf(e.family)} · ${e.tagline}` : e.tagline);
  const { panel, wishlist, type } = selected.item;

  return (
    <div className="flex min-h-0 flex-col gap-3.5">
      <section aria-labelledby={headingId} className="lacquer flex min-h-0 flex-1 flex-col gap-2 rounded-hero px-2.5 pt-3 pb-2.5">
        <div className="px-0.5">
          <SearchField value={query} onChange={onQuery} placeholder={t("searchPlaceholder", { count: entries.length })} />
        </div>
        <div className="px-2 pt-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id={headingId} className="text-sm font-bold">
              {title}
            </h2>
            <span className="text-xs whitespace-nowrap text-text-muted">{count}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{sub}</p>
        </div>
        <ul className="flex max-h-[26rem] min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
          {on.map((e) => (
            <li key={e.slug}>
              <BoosterRow entry={e} sub={subOf(e)} selected={e.slug === selected.slug} stock={stock} onSelect={onSelect} />
            </li>
          ))}
          {off.length > 0 && (
            <li className="px-2.5 pt-2.5 pb-1 text-[11px] font-bold tracking-[0.08em] text-text-muted uppercase">{t("offGroup", { count: off.length })}</li>
          )}
          {off.map((e) => (
            <li key={e.slug}>
              <BoosterRow entry={e} sub={subOf(e)} selected={false} stock={stock} onSelect={onSelect} />
            </li>
          ))}
          {on.length + off.length === 0 && <li className="px-2.5 py-4 text-sm text-text-muted">{t("noResults")}</li>}
        </ul>
      </section>

      {panel && (
        <section className="lacquer flex flex-col gap-2.5 rounded-hero px-4 py-3.5">
          <h2 className="text-xs font-bold">{tb("composition")}</h2>
          <BoosterComposition panel={panel} isBox={type.shape === "JUBAKO"} />
        </section>
      )}

      {wishlist && (
        <section className="flex flex-col gap-2">
          <h2 className="sr-only">{tb("wishlist.title")}</h2>
          <WishlistSummary wishlist={wishlist} />
        </section>
      )}
    </div>
  );
}
