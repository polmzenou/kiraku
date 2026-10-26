"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { groupByFamily, searchEntries } from "@/lib/boosters/showcase";
import type { BoosterFamily } from "@/lib/boosters/types";
import { CloseIcon, IconButton } from "../../ui/IconButton";
import { SearchField } from "./ShowcaseList";
import { BoosterRow } from "./ShowcaseRow";
import type { Entry, ShowcaseFamily } from "./types";

/**
 * Bouton « Tous » des onglets (mobile) : feuille qui monte du bas avec la recherche et tous les
 * boosters rangés par famille. Choisir un booster referme la feuille.
 */
export function AllBoostersSheet({
  entries,
  families,
  selectedSlug,
  stock,
  rotationNote,
  onSelect,
}: {
  entries: Entry[];
  families: ShowcaseFamily[];
  selectedSlug: string;
  stock: number;
  rotationNote: string;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("boosters.showcase");
  const tb = useTranslations("boosters");
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const titleId = useId();
  const titleOf = (f: BoosterFamily) => families.find((x) => x.family === f)?.title ?? f;

  const close = () => dialog.current?.close();
  const pick = (slug: string) => {
    onSelect(slug);
    close();
  };
  const hits = query.trim() ? searchEntries(entries, query, titleOf) : null;
  const groups = groupByFamily(
    entries,
    families.map((f) => f.family),
  );

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className="flex w-[3.75rem] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--chip-b)] bg-[var(--chip)] text-[11px] font-bold text-[var(--ink)] lg:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        {t("all")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[86dvh] w-full max-w-none translate-y-full flex-col overflow-hidden rounded-t-[24px] border-t border-border bg-surface p-0 text-text opacity-0 shadow-float transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-black/60 open:flex open:translate-y-0 open:opacity-100 starting:open:translate-y-full starting:open:opacity-0 motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="mt-2.5 h-1.5 w-10 shrink-0 self-center rounded-full bg-text-muted/30" />
        <div className="flex items-center justify-between py-1.5 pr-2 pl-4">
          <h2 id={titleId} className="font-title text-lg font-extrabold">
            {t("allTitle")}
          </h2>
          <IconButton aria-label={tb("close")} onClick={close} tone="lacquer">
            <CloseIcon />
          </IconButton>
        </div>
        <div className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder={t("searchPlaceholder", { count: entries.length })} />
        </div>
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {hits ? (
            <>
              {hits.map((e) => (
                <li key={e.slug}>
                  <BoosterRow entry={e} sub={`${titleOf(e.family)} · ${e.tagline}`} selected={e.slug === selectedSlug} stock={stock} onSelect={pick} />
                </li>
              ))}
              {hits.length === 0 && <li className="px-2 py-4 text-sm text-text-muted">{t("noResults")}</li>}
            </>
          ) : (
            groups.map((g) => {
              const fam = families.find((f) => f.family === g.family)!;
              return (
                <li key={g.family}>
                  <div className="flex flex-col gap-0.5 px-2 pt-3 pb-1">
                    <h3 className="flex items-baseline gap-2 text-xs font-bold">
                      <span aria-hidden="true" lang="ja" className="font-seal text-sm text-shu">
                        {fam.kanji}
                      </span>
                      {fam.title}
                    </h3>
                    <p className="text-[11px] text-text-muted">
                      {fam.rotating ? `${t("rotatingCount", { on: g.on.length, total: g.on.length + g.off.length })} · ${rotationNote}` : t("count", { count: g.on.length })}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {[...g.on, ...g.off].map((e) => (
                      <li key={e.slug}>
                        <BoosterRow entry={e} sub={e.tagline} selected={e.slug === selectedSlug} stock={stock} onSelect={pick} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })
          )}
        </ul>
      </dialog>
    </>
  );
}
