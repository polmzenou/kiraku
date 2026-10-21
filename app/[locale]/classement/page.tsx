import type { Metadata } from "next";
import { hasLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TopCollectors } from "@/components/home/TopCollectors";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { PlayerRow } from "@/components/social/PlayerRow";
import { RankEmblem } from "@/components/ranked/RankEmblem";
import { segmentedItemClass, segmentedTrackClass } from "@/components/ui/Segmented";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo/alternates";
import { getTopCollectors, LEADERBOARD_SIZE, type Collector } from "@/server/collection/leaderboard";
import { ensureSeason, getRankedLeaderboard, getRankedRules, type RankedEntry } from "@/server/ranked/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/classement">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "leaderboard" });
  return {
    title: t("title"),
    description: t("metaDescription", { count: LEADERBOARD_SIZE }),
    alternates: localeAlternates("/classement", locale),
  };
}

/**
 * Classements : collectionneurs (podium puis les 50 premiers) et classé (?vue=classe : top 100 de la
 * saison, emblème et PC). Profils publics seulement.
 */
export default async function LeaderboardPage({ searchParams }: PageProps<"/[locale]/classement">) {
  const { vue } = await searchParams;
  const ranked = vue === "classe";
  const [t, tRanked, collectors] = await Promise.all([getTranslations("leaderboard"), getTranslations("ranked"), ranked ? [] : getTopCollectors()]);

  const tabs = (
    <nav aria-label={tRanked("board.tabs")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className={segmentedTrackClass}>
        {([
          ["collectors", "/classement", !ranked],
          ["ranked", "/classement?vue=classe", ranked],
        ] as const).map(([key, href, current]) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={segmentedItemClass}
            >
              {tRanked(`board.${key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  if (ranked) {
    return (
      <PageShell>
        <SectionTitle level={1} kanji="番付" title={tRanked("board.tabs")} />
        {tabs}
        <RankedBoard />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SectionTitle level={1} kanji="番付" title={t("title")} subtitle={t("intro", { count: LEADERBOARD_SIZE })} />
      {tabs}
      {collectors.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <TopCollectors collectors={collectors.slice(0, 3)} withHeader={false} />
          <ol className="flex flex-col lacquer rounded-card px-4">
            {collectors.map((c) => (
              <Row key={c.username} collector={c} />
            ))}
          </ol>
        </>
      )}
    </PageShell>
  );
}

function Row({ collector }: { collector: Collector }) {
  const t = useTranslations("home.collectors");
  return (
    <PlayerRow
      player={collector}
      detail={`${t("cards", { count: collector.uniqueCards })} · ${t("mythics", { count: collector.mythics })}`}
    >
      <span className="w-10 text-right font-title text-lg font-extrabold text-text-muted tabular-nums">
        <span className="sr-only">{t("rank", { rank: collector.rank })}</span>
        <span aria-hidden="true">{collector.rank}</span>
      </span>
    </PlayerRow>
  );
}

/** Top du classé de la saison : podium des trois premiers, puis la liste avec emblème et PC. */
async function RankedBoard() {
  const tRanked = await getTranslations("ranked");
  const rules = await getRankedRules();
  const [entries, season] = await Promise.all([getRankedLeaderboard(rules), ensureSeason(rules)]);
  const rankName = (e: RankedEntry) =>
    e.division ? tRanked("rank", { tier: tRanked(`tiers.${e.tier}`), division: tRanked(`divisions.${e.division}`) }) : tRanked(`tiers.${e.tier}`);
  if (entries.length === 0) return <p className="text-sm text-text-muted">{tRanked("board.empty")}</p>;
  const podium = entries.slice(0, 3);
  return (
    <section className="flex flex-col gap-4">
      {season && <h2 className="font-title text-lg font-bold">{tRanked("board.rankedTitle", { number: season.number })}</h2>}
      <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {[podium[1], podium[0], podium[2]].map((e, i) =>
          e ? (
            <li
              key={e.username}
              className={`battle-board battle-rim rounded-card p-[3px] ${i === 1 ? "order-2" : i === 0 ? "order-1" : "order-3"}`}
              data-tier={e.tier}
            >
              <Link
                href={`/u/${e.username}`}
                className={`battle-table flex flex-col items-center gap-1 rounded-[10px] px-2 text-center text-washi-paper ${i === 1 ? "py-5" : "py-3"}`}
              >
                <span className="font-title text-xl font-extrabold text-[var(--board-accent)]">{e.position}</span>
                <RankEmblem tier={e.tier} division={e.division} size={i === 1 ? 72 : 56} label={rankName(e)} />
                <span className="w-full truncate text-sm font-bold">{e.username}</span>
                <span className="text-xs tabular-nums text-[#a89f92]">{tRanked("pc", { pc: e.pc })}</span>
              </Link>
            </li>
          ) : (
            <li key={`vide-${i}`} className={i === 1 ? "order-2" : i === 0 ? "order-1" : "order-3"} />
          ),
        )}
      </ol>
      <ol className="flex flex-col lacquer rounded-card px-4">
        {entries.map((e) => (
          <PlayerRow key={e.username} player={{ username: e.username, image: e.image, isGuest: false }} detail={`${rankName(e)} · ${tRanked("pc", { pc: e.pc })}`}>
            <RankEmblem tier={e.tier} division={e.division} size={28} />
            <span className="w-10 text-right font-title text-lg font-extrabold tabular-nums text-text-muted">{e.position}</span>
          </PlayerRow>
        ))}
      </ol>
      <p className="text-xs text-text-muted">{tRanked("board.hidden")}</p>
    </section>
  );
}
