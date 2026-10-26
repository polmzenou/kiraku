"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { priceFor } from "@/lib/boosters/types";
import { BoosterArt } from "../BoosterArt";
import type { Entry } from "./types";

/** Prix court d'un booster (« Gratuit », « 300 Zeni », « Événement ») et sa couleur. */
function usePriceLabel() {
  const t = useTranslations("boosters.price");
  return (entry: Entry, stock: number) => {
    const { type, panel } = entry.item;
    if (panel?.availability === "locked") return { text: t("event"), tone: "text-ai" };
    const price = priceFor(type, stock, 1);
    if (price.kind === "free") return { text: t("free"), tone: "text-shu" };
    if (price.kind === "zeni") return { text: t("zeni", { amount: price.amount }), tone: "text-kin" };
    return { text: t("event"), tone: "text-ai" };
  };
}

function MiniArt({ entry, off }: { entry: Entry; off?: boolean }) {
  const { type } = entry.item;
  return (
    <BoosterArt
      shape={type.shape}
      theme={type.theme}
      emblem={type.emblem}
      name=""
      contents=""
      compact
      className={off ? "grayscale-[0.6]" : ""}
    />
  );
}

/** Ligne de liste (colonne de droite en desktop, feuille « Tous » en mobile). */
export function BoosterRow({
  entry,
  sub,
  selected,
  stock,
  onSelect,
}: {
  entry: Entry;
  sub: string;
  selected: boolean;
  stock: number;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("boosters.showcase");
  const priceLabel = usePriceLabel();
  const base = "grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2.5 py-1.5 text-left";

  if (!entry.selectable) {
    return (
      <div className={`${base} opacity-50`}>
        <MiniArt entry={entry} off />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{entry.name}</span>
          <span className="block truncate text-xs text-text-muted">{sub}</span>
        </span>
        <span className="text-xs font-bold whitespace-nowrap text-text-muted">{t("offSelection")}</span>
      </div>
    );
  }
  const price = priceLabel(entry, stock);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(entry.slug)}
      style={{ "--rb": entry.item.type.theme.base } as CSSProperties}
      className={`${base} transition-colors hover:bg-surface-2 aria-pressed:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--rb)_38%,transparent),var(--color-surface-2)_75%)] aria-pressed:shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--rb)_85%,white)] motion-reduce:transition-none`}
    >
      <MiniArt entry={entry} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{entry.name}</span>
        <span className="block truncate text-xs text-text-muted">{sub}</span>
      </span>
      <span className={`text-xs font-bold whitespace-nowrap ${price.tone}`}>{price.text}</span>
    </button>
  );
}

/** Tuile du bandeau mobile sous le hero. */
export function BoosterStripTile({
  entry,
  selected,
  stock,
  onSelect,
}: {
  entry: Entry;
  selected: boolean;
  stock: number;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("boosters.showcase");
  const priceLabel = usePriceLabel();
  const base = "flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-control px-1 pt-1.5 pb-1 text-[11px] font-bold";
  const art = (off?: boolean) => (
    <span className="w-10">
      <MiniArt entry={entry} off={off} />
    </span>
  );

  if (!entry.selectable) {
    return (
      <div className={`${base} opacity-45`}>
        {art(true)}
        <span className="max-w-full truncate">{entry.name}</span>
        <span className="text-[10px] text-text-muted">{t("offShort")}</span>
      </div>
    );
  }
  const price = priceLabel(entry, stock);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(entry.slug)}
      style={{ "--rb": entry.item.type.theme.base } as CSSProperties}
      className={`${base} min-h-11 aria-pressed:bg-surface-2 aria-pressed:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--rb)_80%,white)]`}
    >
      {art()}
      <span className="max-w-full truncate">{entry.name}</span>
      <span className={`text-[10px] ${price.tone}`}>{price.text}</span>
    </button>
  );
}
