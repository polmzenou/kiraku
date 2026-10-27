"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { BoosterTheme } from "@/lib/boosters/types";
import { EndsIn } from "../EndsIn";

export type FocusAnnouncement = {
  slug: string;
  /** Titres des œuvres mises en avant, déjà traduits. */
  series: string[];
  endsAt: number;
  theme: BoosterTheme;
  emblem: string;
};

/**
 * « En ce moment, il y a un booster spécial série JJK ! » : annonce du Focus série en cours, aux
 * couleurs de son sachet, avec sa fin et un bouton qui ouvre l'onglet Spéciaux sur ce booster.
 */
export function FocusBanner({ focus, serverNow, onOpen }: { focus: FocusAnnouncement; serverNow: number; onOpen: () => void }) {
  const t = useTranslations("boosters.focus");
  const format = useFormatter();
  const dark = focus.theme.ink === "dark";
  const series = format.list(focus.series, { type: "conjunction" });

  return (
    <aside
      aria-labelledby="focus-banner-title"
      className={`relative isolate flex flex-col gap-3 overflow-hidden rounded-card border border-white/10 p-4 sm:flex-row sm:items-center sm:gap-4 ${
        dark ? "text-[#1f1b17]" : "text-[#f1e9da]"
      }`}
      style={{ background: `linear-gradient(110deg, ${focus.theme.base}, ${focus.theme.dark})` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          lang="ja"
          className={`flex size-11 shrink-0 items-center justify-center rounded-full font-seal text-xl ${dark ? "bg-[#1f1b17]/10" : "bg-black/30"} text-kin`}
        >
          {focus.emblem}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id="focus-banner-title" className="text-sm font-bold sm:text-base">
            {t.rich("announce", { series, strong: (chunks) => <strong className="font-heading font-extrabold">{chunks}</strong> })}
          </p>
          <EndsIn endsAt={focus.endsAt} serverNow={serverNow} className={`text-xs font-bold ${dark ? "text-[#1f1b17]/75" : "text-[#f1e9da]/80"}`} />
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold transition-transform active:scale-[0.97] motion-reduce:transition-none ${
          dark ? "bg-[#1f1b17] text-[#f1e9da]" : "bg-[#f1e9da] text-[#1f1b17]"
        }`}
      >
        {t("open")}
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </button>
    </aside>
  );
}
