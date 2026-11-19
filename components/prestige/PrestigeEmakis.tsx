import { getFormatter, getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { scrollCover } from "@/lib/prestige/assets";
import { kanjiNumber } from "@/lib/kanji";
import { toRoman } from "@/lib/prestige/roman";
import { getEmakis } from "@/server/prestige/profile-queries";
import { HeirProcession } from "./HeirProcession";
import "./prestige.css";

/**
 * Rouleaux des cycles sur le profil : un emaki par renaissance, couvert de brocart (une couleur par cycle, à tour de
 * rôle) et posé sur une étagère, son titre 巻之三 sur l'étiquette. Il se déroule au toucher (élément details natif) : la
 * baguette glisse et découvre le papier, avec la date, le rang global, les Zeni, les cartes, puis les héritières en
 * procession qui défile seule et se fait glisser, comme « Gros tirages ».
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
      <div className="pr-shelf">
        {[...emakis].reverse().map((e) => {
          const title = `巻之${kanjiNumber(e.number)}`;
          const date = format.dateTime(e.createdAt, { dateStyle: "medium" });
          return (
            <details key={e.number} className="pr-scroll">
              <summary className="pr-scroll-rolled">
                <span aria-hidden="true" className="pr-roll" style={{ backgroundImage: `url("${scrollCover(e.number)}")` } as CSSProperties}>
                  <span lang="ja" className={`pr-roll-slip font-seal${title.length > 3 ? " long" : ""}`}>
                    {title}
                  </span>
                </span>
                <span className="pr-scroll-label">
                  <b className="font-title text-base">{t("cycle", { roman: toRoman(e.number) })}</b>
                  <span>
                    {date} · {t("rank", { rank: e.globalRank })}
                  </span>
                </span>
              </summary>
              <div className="pr-scroll-open">
                <span aria-hidden="true" className="pr-rod" />
                <div className="pr-scroll-paper">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" lang="ja" className="shrink-0 border-l-2 border-shu py-1 pl-1.5 font-seal text-xl leading-tight [writing-mode:vertical-rl]">
                      転生 {title}
                    </span>
                    <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                      <dt className="sr-only">{t("rankLabel")}</dt>
                      <dd className="col-span-2 font-title text-base font-bold">{t("cycle", { roman: toRoman(e.number) })}</dd>
                      <dd className="col-span-2 text-[#5b544a]">
                        {t("rank", { rank: e.globalRank })} · {date}
                      </dd>
                      <dt className="text-[#5b544a]">{t("zeni")}</dt>
                      <dd className="text-right font-bold tabular-nums">{format.number(e.zeni)}</dd>
                      <dt className="text-[#5b544a]">{t("cards")}</dt>
                      <dd className="text-right font-bold tabular-nums">{format.number(e.uniqueCards)}</dd>
                    </dl>
                  </div>
                  {e.heirs.length > 0 && (
                    <>
                      <p className="text-xs font-bold tracking-widest text-[#5b544a] uppercase">{t("heirs", { count: e.heirs.length })}</p>
                      <HeirProcession heirs={e.heirs} label={t("heirs", { count: e.heirs.length })} />
                    </>
                  )}
                </div>
                <span aria-hidden="true" className="pr-unroller">
                  <span className="pr-rod" />
                  <span className="pr-cover" />
                </span>
              </div>
            </details>
          );
        })}
        <span aria-hidden="true" className="pr-plank" />
      </div>
    </section>
  );
}
