import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { JourneyStep } from "@/server/prestige/copies";

/**
 * Provenance d'un exemplaire spécial, en fil simple : une ligne datée par propriétaire, du premier au dernier, avec la
 * façon dont il l'a obtenu. Le pseudo ne mène au profil que s'il est visible par le lecteur.
 */
export async function CopyJourney({ steps }: { steps: readonly JourneyStep[] }) {
  if (steps.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("collection.card.journey"), getFormatter()]);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-text-muted">{t("title")}</p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={i} className="min-h-6 border-l-2 border-border pl-3 text-xs leading-6">
            {s.username ? (
              <Link href={`/u/${s.username}`} className="font-bold text-link underline underline-offset-4">
                {s.name}
              </Link>
            ) : (
              <span className="font-bold">
                {s.locked && <span aria-hidden="true">🔒 </span>}
                {s.name}
              </span>
            )}{" "}
            <span className="text-text-muted">
              · {t(`via.${s.via}`)} · {format.dateTime(s.at, { dateStyle: "medium" })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
