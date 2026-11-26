import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { BanzukePoster, DohyoStage, RankPrize, TITLE_KANJI } from "@/components/ennichi/Banzuke";
import { EnnichiHelp } from "@/components/ennichi/Help";
import { EnnichiNotStarted } from "@/components/ennichi/NotStarted";
import { Lantern, Tsuna } from "@/components/ennichi/parts";
import { Seal } from "@/components/ennichi/Seal";
import "@/components/ennichi/ennichi-base.css";
import "@/components/ennichi/ennichi.css";
import { PageShell } from "@/components/PageShell";
import { PlayerAvatar } from "@/components/social/PlayerAvatar";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { awardsState } from "@/lib/ennichi/awards";
import { rankBand } from "@/lib/ennichi/rules";
import { prisma } from "@/server/db";
import { banzukeView, ennichiView, myAwards } from "@/server/ennichi/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ennichi.banzuke");
  return { title: t("title") };
}

/**
 * Banzuke : en direct, l'affiche du jour (maquette « Tableau de sumo ») et la place du joueur ; après le tirage, le
 * podium Dohyō, les lots des trois premiers, chaque ligne de lots et la place du joueur (prix versés tout seuls). Après
 * le tirage, les rangs et leurs lots sont ceux figés par le tirage (la vue les relit), pas les réglages du moment.
 */
export default async function BanzukePage() {
  const [t, format, locale, user] = await Promise.all([getTranslations("ennichi.banzuke"), getFormatter(), getLocale(), getCurrentUser()]);
  const view = await ennichiView(locale);
  if (view.phase === "off" || view.phase === "before") return <EnnichiNotStarted view={view} />;
  const viewer = user && !user.isGuest ? user.id : null;
  const bz = await banzukeView(view, viewer);
  const dateHour = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "");
  const me = bz.me;
  const myBand = me ? rankBand(me.rank, view.ranks) : null;
  const header = (
    <>
      <Link href="/ennichi" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-text-muted hover:text-text">
        <span aria-hidden="true">←</span> {t("back")}
      </Link>
      <div className="flex items-center gap-3">
        <Seal kanji="番" />
        <div className="min-w-0 flex-1">
          <h1 className="m3-h2 font-heading">{t("title")}</h1>
          <p className="text-xs text-text-muted">
            {bz.final
              ? t("frozen", { date: dateHour(view.drawnAt), count: bz.rows.length })
              : view.phase === "closing"
                ? t("closing", { date: dateHour(view.closesAt) })
                : t("live", { date: dateHour(view.closesAt) })}
          </p>
        </div>
        <EnnichiHelp topic="banzuke" view={view} />
      </div>
    </>
  );

  if (!bz.final) {
    return (
      <PageShell>
        <div className="enn flex flex-col gap-4">
          {header}
          <div className="m3-bz">
            <BanzukePoster view={view} bz={bz} />
            <div className="m3-side">
              <section className="flex flex-col gap-3 lacquer rounded-card p-4">
                <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{t("place")}</span>
                {me ? (
                  <>
                    <div className="m3-place-row">
                      <Seal kanji={myBand?.title ? TITLE_KANJI[myBand.title] : "番"} size={48} />
                      <div>
                        <b>
                          {t("ord", { rank: me.rank })}
                          {myBand?.title ? ` · ${t(`titles.${myBand.title}`)}` : ""}
                        </b>
                        <div className="text-xs text-text-muted">{t("installedDuring", { count: me.count })}</div>
                      </div>
                    </div>
                    {myBand ? (
                      <div className="m3-won">
                        <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{view.phase === "live" ? t("ifStoppedNow") : t("ifStoppedNowClosing")}</span>
                        <RankPrize band={myBand} />
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">{t("topWin", { count: view.lastPaidRank })}</p>
                    )}
                    <p className="text-xs text-text-muted">{t("tieRule")}</p>
                  </>
                ) : (
                  <>
                    <p>
                      <b>{t("notYet")}</b>
                    </p>
                    <p className="text-xs text-text-muted">{t("notYetBody")}</p>
                    {view.phase === "live" && (
                      <Link href="/parrainage" className={buttonClasses("primary", "self-start")}>
                        {t("invite")}
                      </Link>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // Après le tirage : podium, lots des trois premiers, chaque ligne de lots
  const topRows = bz.rows.filter((r) => r.rank <= 3);
  const images = new Map(
    (await prisma.user.findMany({ where: { id: { in: topRows.flatMap((r) => (r.userId ? [r.userId] : [])) } }, select: { id: true, image: true } })).map((u) => [u.id, u.image]),
  );
  const top = topRows.map((r) => ({ ...r, image: r.userId ? (images.get(r.userId) ?? null) : null }));
  const podiumBands = view.ranks.filter((b) => b.from <= 3);
  const lists = view.ranks
    .map((b) => ({ ...b, from: Math.max(b.from, 4) }))
    .filter((b) => b.from <= b.to);
  // Prix du rang : versé, encore à verser (le cron s'en charge) ou écarté (compte banni ou supprimé entre-temps)
  const received = awardsState(viewer ? (await myAwards(view.edition, viewer)).filter((a) => a.kind === "BANZUKE").map((a) => a.state) : []);

  return (
    <PageShell>
      <div className="enn flex flex-col gap-4">
        {header}
        <div className="m3-final">
          <div className="m3-col">
            <DohyoStage view={view} top={top} />
            <section className="m3-plaque flex flex-col lacquer rounded-card p-4">
              {podiumBands.map((b) => {
                const winners = top.filter((r) => r.rank >= b.from && r.rank <= b.to);
                return (
                  <div key={b.from} className="m3-pl-row">
                    <Seal kanji={b.title ? TITLE_KANJI[b.title] : "番"} size={32} />
                    <div className="m3-pl-t">
                      <b>
                        {b.title ? `${t(`titles.${b.title}`)} · ` : ""}
                        {t("bandLabel", { from: b.from, to: b.to })}
                      </b>
                      <span className="text-xs text-text-muted">{winners.map((w) => (w.me ? t("you") : w.name)).join(", ") || t("freePlace")}</span>
                      <RankPrize band={b} />
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
          <div className="m3-col">
            {me && myBand ? (
              <section className="flex flex-col gap-3 lacquer rounded-card p-4">
                <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{t("place")}</span>
                <div className="m3-place-row">
                  <Seal kanji={myBand.title ? TITLE_KANJI[myBand.title] : "番"} size={48} />
                  <div>
                    <b>
                      {t("ord", { rank: me.rank })}
                      {myBand.title ? ` · ${t(`titles.${myBand.title}`)}` : ""}
                    </b>
                    <div className="text-xs text-text-muted">{received === "PAID" ? t("paid") : received === "SKIPPED" ? t("skipped") : t("paying")}</div>
                  </div>
                </div>
                <RankPrize band={myBand} compact={false} />
                {(myBand.choiceVouchers > 0 || myBand.oneOfOne) && (
                  <Link href="/parrainage/bons" className={buttonClasses("primary", "self-start")}>
                    {t("chooseCards")}
                  </Link>
                )}
              </section>
            ) : (
              <section className="procl lacquer rounded-card">
                <Lantern kanji="祭" on width={44} />
                <h2 className="font-heading text-xl">{t("thanks")}</h2>
                <p className="text-xs text-text-muted">{me ? t("outThisTime", { rank: me.rank }) : t("notRanked")}</p>
              </section>
            )}
            {me && myBand?.title && (
              <section className="prof-mini lacquer rounded-card">
                {myBand.title === "yokozuna" && <Tsuna className="m3-tsuna-card" />}
                <PlayerAvatar username={me.name} image={user?.image ?? null} size={64} />
                <b className="m3-pm-name">{me.name}</b>
                <span className={`title-chip ${myBand.title === "yokozuna" ? "yoko" : ""}`}>
                  <b lang="ja">{TITLE_KANJI[myBand.title]}</b>
                  {t("titleChip", { title: t(`titles.${myBand.title}`), edition: view.edition })}
                </span>
                <span className="text-xs text-text-muted">{t("titleStays")}</span>
              </section>
            )}
            {lists.map((b) => {
              const rows = bz.rows.filter((r) => r.rank >= b.from && r.rank <= b.to);
              return (
                <section key={b.from} className="m3-band lacquer rounded-card">
                  <div className="flex flex-col gap-2 p-4 pb-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="inline-flex items-baseline gap-2 font-title text-base font-bold">
                        {b.title && (
                          <span lang="ja" className="m3-k">
                            {TITLE_KANJI[b.title]}
                          </span>
                        )}
                        {b.title ? t(`titles.${b.title}`) : t("topN", { count: b.to })}
                      </h2>
                      <span className="text-xs text-text-muted">{t("bandLabel", { from: b.from, to: b.to })}</span>
                    </div>
                    <div className="m3-lot">
                      <span className="text-xs text-text-muted">{t("eachGets")}</span>
                      <RankPrize band={b} />
                    </div>
                  </div>
                  {rows.length === 0 ? (
                    <p className="m3-band-empty text-xs text-text-muted">{t("nobodyHere")}</p>
                  ) : b.to - b.from >= 10 ? (
                    <div className="m3-grid">
                      {rows.map((r) => (
                        <span key={r.rank} className={`m3-cell${r.me ? " me" : ""}`}>
                          <i>{r.rank}</i>
                          <b>{r.me ? t("you") : r.name}</b>
                          <em>{format.number(r.count)}</em>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="lb">
                      {rows.map((r) => (
                        <div key={r.rank} className={`lb-row${r.me ? " me" : ""}`}>
                          <span className="lb-pos">{r.rank}</span>
                          <PlayerAvatar username={r.name} image={null} size={32} />
                          <b className="m3-ellip">{r.me ? t("you") : r.name}</b>
                          <span className="text-xs text-text-muted">
                            <b className="m3-cnt">{format.number(r.count)}</b> {t("friendsShort", { count: r.count })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Link href="/ennichi/omikuji" className={buttonClasses("secondary")}>
                {t("omikujiResults")}
              </Link>
              <Link href="/ennichi" className={buttonClasses("ghost")}>
                {t("fete")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
