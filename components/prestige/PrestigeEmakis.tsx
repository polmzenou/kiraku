import { getFormatter, getTranslations } from "next-intl/server";
import { toRoman } from "@/lib/prestige/roman";
import { getEmakis } from "@/server/prestige/profile-queries";
import { Fuda } from "../fuda/Fuda";
import "./prestige.css";

/**
 * Rouleaux des cycles sur le profil : un emaki par renaissance, roulé sur son étagère. Il se déroule au toucher
 * (élément details natif, sans script) : date, rang global, Zeni, record, et les héritières en procession.
 */
export async function PrestigeEmakis({ userId, locale }: { userId: string; locale: string }) {
  const emakis = await getEmakis(userId, locale);
  if (emakis.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("prestige.emakis"), getFormatter()]);
  return (
    <section aria-labelledby="prestige-emakis" className="flex flex-col gap-3">
      <h2 id="prestige-emakis" className="flex items-center gap-2 font-heading text-xl">
        <span aria-hidden="true" lang="ja" className="font-seal text-kin">巻</span>
        {t("title")}
      </h2>
      <div className="pr-shelf flex flex-col gap-2">
        {[...emakis].reverse().map((e) => (
          <details key={e.number} className="pr-scroll">
            <summary className="pr-scroll-rolled">
              <span aria-hidden="true" className="pr-scroll-knob" />
              <span className="pr-scroll-label">
                <b className="font-title">{t("cycle", { roman: toRoman(e.number) })}</b>
                <span>{format.dateTime(e.createdAt, { dateStyle: "medium" })}</span>
              </span>
              <span aria-hidden="true" className="pr-scroll-knob" />
            </summary>
            <div className="pr-scroll-paper">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" lang="ja" className="grid h-14 w-9 shrink-0 place-items-center rounded-[3px] bg-shu-btn font-seal text-base text-washi-paper [writing-mode:vertical-rl]">
                  転生
                </span>
                <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="sr-only">{t("rankLabel")}</dt>
                  <dd className="col-span-2 font-title text-base font-bold">{t("rank", { rank: e.globalRank })}</dd>
                  <dt className="text-[#5b544a]">{t("zeni")}</dt>
                  <dd className="text-right font-bold tabular-nums">{format.number(e.zeni)}</dd>
                  <dt className="text-[#5b544a]">{t("cards")}</dt>
                  <dd className="text-right font-bold tabular-nums">{format.number(e.uniqueCards)}</dd>
                </dl>
              </div>
              {e.heirs.length > 0 && (
                <>
                  <p className="text-xs font-bold tracking-widest text-[#5b544a] uppercase">{t("heirs", { count: e.heirs.length })}</p>
                  <ul className="pr-procession">
                    {e.heirs.map((card, i) => (
                      <li key={i}>
                        <Fuda card={card} size="sm" still describeImage />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
