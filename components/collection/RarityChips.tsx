"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Rarity } from "@/lib/catalog/rarity";
import { useFilterRarities, useRaritySeals } from "@/lib/catalog/use-rarities";
import { chipClasses } from "../ui/Chip";

/**
 * Puces de rareté à cocher (de la plus rare à la plus courante), avec leur sceau. Une rareté sans carte publiée
 * n'apparaît pas, sauf si elle est cochée ou comptée dans `counts` (cartes possédées, archivées comprises).
 * `allowed` limite les puces proposées ; `leading` ajoute des puces avant (ex. « doublons »).
 */
export function RarityChips({
  value,
  onChange,
  allowed,
  counts,
  leading,
  className = "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0",
}: {
  value: readonly Rarity[];
  onChange: (next: Rarity[]) => void;
  allowed?: readonly Rarity[];
  counts?: Partial<Record<Rarity, number>>;
  leading?: ReactNode;
  className?: string;
}) {
  const owned = counts ? Object.keys(counts).filter((r) => (counts[r] ?? 0) > 0) : [];
  const RARITIES = useFilterRarities([...value, ...owned]);
  const RARITY_SEAL = useRaritySeals();
  const t = useTranslations("collection");
  const tRarity = useTranslations("rarity");
  const shown = [...RARITIES].reverse().filter((r) => !allowed || allowed.includes(r));

  return (
    <div role="group" aria-label={t("rarityFilter")} className={className}>
      {leading}
      {shown.map((r) => {
        const active = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((x) => x !== r) : [...value, r])}
            className={chipClasses(active)}
          >
            <span aria-hidden="true" className="font-seal text-base">
              {RARITY_SEAL[r]}
            </span>
            {tRarity(r)}
            {counts?.[r] !== undefined && <span className="tabular-nums text-text-muted">{counts[r]}</span>}
          </button>
        );
      })}
    </div>
  );
}
