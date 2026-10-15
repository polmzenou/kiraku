import type { Metadata } from "next";
import { hasLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TopCollectors } from "@/components/home/TopCollectors";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { PlayerRow } from "@/components/social/PlayerRow";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getTopCollectors, LEADERBOARD_SIZE, type Collector } from "@/server/collection/leaderboard";

export async function generateMetadata({ params }: PageProps<"/[locale]/classement">): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "leaderboard" });
  return {
    title: t("title"),
    description: t("metaDescription", { count: LEADERBOARD_SIZE }),
    alternates: {
      canonical: getPathname({ href: "/classement", locale }),
      languages: Object.fromEntries(routing.locales.map((l) => [l, getPathname({ href: "/classement", locale: l })])),
    },
  };
}

/** Classement complet des collectionneurs : podium puis les 50 premiers (profils publics). */
export default async function LeaderboardPage() {
  const [t, collectors] = await Promise.all([getTranslations("leaderboard"), getTopCollectors()]);

  return (
    <PageShell>
      <SectionTitle level={1} kanji="番付" title={t("title")} subtitle={t("intro", { count: LEADERBOARD_SIZE })} />
      {collectors.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <TopCollectors collectors={collectors.slice(0, 3)} withHeader={false} />
          <ol className="flex flex-col rounded-xl border border-border bg-surface px-4">
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
