import { useFormatter, useTranslations } from "next-intl";
import { completion, type CollectionSummary } from "@/lib/collection/view";

/** Trois chiffres en tête de collection : cartes uniques, exemplaires, part du catalogue. */
export function CollectionStats({ summary }: { summary: CollectionSummary }) {
  const t = useTranslations("collection.stats");
  const format = useFormatter();
  const cells = [
    [t("unique"), format.number(summary.unique)],
    [t("copies"), format.number(summary.copies)],
    [t("completion"), format.number(completion(summary), { style: "percent", maximumFractionDigits: 1 })],
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-2 md:gap-3">
      {cells.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5 lacquer rounded-card p-3">
          <dt className="truncate text-xs text-text-muted">{label}</dt>
          <dd className="text-lg font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
