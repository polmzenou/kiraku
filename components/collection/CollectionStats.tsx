import { useFormatter, useTranslations } from "next-intl";
import { completion, type CollectionSummary } from "@/lib/collection/view";
import type { CollectionValue } from "@/lib/market/quotes";

/**
 * Chiffres en tête de collection : cartes uniques, exemplaires, part du catalogue et, pour sa propre
 * collection, la valeur estimée au cours du marché (cote de chaque carte, sinon médiane de sa rareté).
 */
export function CollectionStats({ summary, value }: { summary: CollectionSummary; value?: CollectionValue }) {
  const t = useTranslations("collection.stats");
  const format = useFormatter();
  const cells = [
    [t("unique"), format.number(summary.unique)],
    [t("copies"), format.number(summary.copies)],
    [t("completion"), format.number(completion(summary), { style: "percent", maximumFractionDigits: 1 })],
    ...(value ? [[t("value"), t("valueZeni", { amount: value.total })] as const] : []),
  ] as const;
  return (
    <div className="flex flex-col gap-1">
      <dl className={`grid gap-2 md:gap-3 ${value ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
        {cells.map(([label, shown]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 lacquer rounded-card p-3">
            <dt className="truncate text-xs text-text-muted">{label}</dt>
            <dd className="text-lg font-bold tabular-nums">{shown}</dd>
          </div>
        ))}
      </dl>
      {value && (value.fromRarity > 0 || value.unpriced > 0) && (
        <p className="text-xs text-text-muted">
          {value.fromRarity > 0 && t("valueByRarity", { amount: value.fromRarity })}
          {value.fromRarity > 0 && value.unpriced > 0 && " · "}
          {value.unpriced > 0 && t("valueUnpriced", { count: value.unpriced })}
        </p>
      )}
    </div>
  );
}
