import { Link } from "@/i18n/navigation";
import { POSSESSION_PARAM, POSSESSIONS, possessionValue, type Possession } from "@/lib/market/possession";
import { segmentedCompactItemClass, segmentedFillClass, segmentedTrackClass } from "../ui/Segmented";

export type PossessionLabels = Record<Possession, string>;

/** Libellés traduits du filtre, depuis le namespace `market.filters`. */
export function possessionLabels(t: (key: `possession.${Possession}`) => string): PossessionLabels {
  return { all: t("possession.all"), owned: t("possession.owned"), missing: t("possession.missing") };
}

/**
 * Filtre « Toutes · Acquises · Non acquises » en radios, dans un formulaire GET (filtres des ventes) :
 * fonctionne sans JavaScript, la valeur part dans l'URL avec les autres filtres.
 */
export function PossessionRadios({ value, legend, labels }: { value: Possession; legend: string; labels: PossessionLabels }) {
  return (
    <fieldset className="col-span-2 flex flex-col gap-1 md:col-span-3">
      <legend className="mb-1 text-xs text-text-muted">{legend}</legend>
      <div className={`${segmentedTrackClass} ${segmentedFillClass}`}>
        {POSSESSIONS.map((p) => (
          <label key={p} className={segmentedCompactItemClass}>
            <input type="radio" name={POSSESSION_PARAM} value={possessionValue(p) ?? ""} defaultChecked={value === p} className="sr-only" />
            {labels[p]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Même filtre en liens (onglets sans formulaire : avis de recherche). `href` reçoit la valeur d'URL. */
export function PossessionLinks({
  value,
  label,
  labels,
  href,
}: {
  value: Possession;
  label: string;
  labels: PossessionLabels;
  href: (urlValue: string | null) => string;
}) {
  return (
    <nav aria-label={label} className={`${segmentedTrackClass} ${segmentedFillClass} sm:w-auto`}>
      {POSSESSIONS.map((p) => (
        <Link
          key={p}
          href={href(possessionValue(p))}
          prefetch={false}
          aria-current={value === p ? "true" : undefined}
          className={segmentedCompactItemClass}
        >
          {labels[p]}
        </Link>
      ))}
    </nav>
  );
}
