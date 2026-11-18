import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { JourneyStep } from "@/server/prestige/copies";

/**
 * Provenance d'un exemplaire spécial en sceaux de collectionneur : un sceau rouge par propriétaire, du premier au
 * dernier, avec la façon dont il l'a obtenu. Le pseudo ne mène au profil que s'il est visible par le lecteur.
 */
export async function CopyJourney({ steps }: { steps: readonly JourneyStep[] }) {
  if (steps.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("collection.card.journey"), getFormatter()]);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-text-muted">{t("title")}</p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex min-h-7 items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="inline-grid size-6 shrink-0 -rotate-6 place-items-center rounded-[2px] bg-shu-btn font-title text-[11px] font-bold text-washi-paper shadow-[inset_0_0_0_1.5px_rgb(255_240_220/0.55)]"
            >
              {[...s.name][0]?.toUpperCase() ?? "?"}
            </span>
            <span className="min-w-0">
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
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
