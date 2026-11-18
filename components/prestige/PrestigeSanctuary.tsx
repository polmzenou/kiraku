import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { keptSpan } from "@/lib/prestige/journey";
import { getSanctuary } from "@/server/prestige/profile-queries";
import { Fuda } from "../fuda/Fuda";
import "./prestige.css";

/**
 * Sanctuaire du profil : l'autel sous la corde shimenawa, les cartes consacrées debout dans leur halo de nacre. Leur
 * parcours (cycles traversés, propriétaires successifs) s'ouvre au toucher. Figé : rien n'y bouge.
 */
export async function PrestigeSanctuary({ userId, viewerId, locale }: { userId: string; viewerId: string | null; locale: string }) {
  const entries = await getSanctuary(viewerId, userId, locale);
  if (entries.length === 0) return null;
  const [t, tVia, format] = await Promise.all([getTranslations("prestige.sanctuary"), getTranslations("collection.card.journey.via"), getFormatter()]);
  return (
    <section id="sanctuaire" aria-labelledby="prestige-sanctuary" className="flex scroll-mt-20 flex-col gap-3">
      <h2 id="prestige-sanctuary" className="flex items-center gap-2 font-heading text-xl">
        <span aria-hidden="true" lang="ja" className="font-seal text-kin">奉</span>
        {t("title")}
      </h2>
      <div className="pr-altar">
        <span aria-hidden="true" className="pr-shimenawa">
          <i />
          <i />
          <i />
          <i />
        </span>
        <ul className="pr-altar-cards">
          {entries.map((e) => {
            const span = keptSpan(e.cycles);
            return (
              <li key={e.id} className="flex flex-col items-center gap-2">
                <div className="pr-relic">
                  <Fuda card={e.card} size="sm" still describeImage />
                </div>
                <details className="w-full text-center">
                  <summary className="mx-auto inline-flex min-h-11 cursor-pointer items-center rounded-pill px-3 text-xs font-bold text-kin">
                    {t("journey")}
                  </summary>
                  <div className="mt-1 flex flex-col gap-1 text-left text-xs">
                    <p className="font-bold">{e.card.name}</p>
                    {span && <p className="text-text-muted">{span.from === span.to ? t("keptOnce", { cycle: span.from }) : t("kept", { from: span.from, to: span.to })}</p>}
                    <ol className="flex flex-col gap-0.5">
                      {e.owners.map((o, i) => (
                        <li key={i}>
                          {o.username ? (
                            <Link href={`/u/${o.username}`} className="font-bold text-link underline underline-offset-4">
                              {o.name}
                            </Link>
                          ) : (
                            <b>{o.name}</b>
                          )}{" "}
                          <span className="text-text-muted">· {tVia(o.via)}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-text-muted">{t("consecratedOn", { date: format.dateTime(e.consecratedAt, { dateStyle: "medium" }) })}</p>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <span aria-hidden="true" className="pr-altar-base" />
      </div>
    </section>
  );
}
