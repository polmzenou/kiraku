import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { EnnichiHelp } from "@/components/ennichi/Help";
import { EnnichiNotStarted } from "@/components/ennichi/NotStarted";
import { OmikujiReel } from "@/components/ennichi/OmikujiReel";
import { OmikujiVerify } from "@/components/ennichi/OmikujiVerify";
import { themedBg } from "@/components/ennichi/parts";
import { Seal } from "@/components/ennichi/Seal";
import "@/components/ennichi/ennichi-base.css";
import "@/components/ennichi/ennichi.css";
import { PageShell } from "@/components/PageShell";
import { LotGifts } from "@/components/referral/LotGifts";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { awardsState } from "@/lib/ennichi/awards";
import { luckOf } from "@/lib/ennichi/omikuji";
import { boosterWord } from "@/lib/referral/lot-text";
import { ennichiView, mergeLotViews, myFete, omikujiView, type PoolLineView } from "@/server/ennichi/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ennichi.omikuji");
  return { title: t("title") };
}

/**
 * Omikuji (maquette « Rouleaux ») : avant le tirage, les tickets du joueur et la cagnotte (du plus rare au moins rare) ;
 * après, la rediffusion des feuilles, ce que le joueur a gagné (versé tout seul), les gagnants de chaque lot et la
 * vérification du tirage dans le navigateur.
 */
export default async function OmikujiPage() {
  const [t, tGifts, format, locale, user] = await Promise.all([getTranslations("ennichi.omikuji"), getTranslations("referralV2.gifts"), getFormatter(), getLocale(), getCurrentUser()]);
  const view = await ennichiView(locale);
  // Fête coupée ou annoncée : ni tickets ni cagnotte en direct
  if (view.phase === "off" || view.phase === "before") return <EnnichiNotStarted view={view} />;
  const viewer = user && !user.isGuest ? user.id : null;
  const mine = viewer ? await myFete(viewer, view) : null;
  const om = await omikujiView(view, viewer, mine);
  const dateHour = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "");

  // Nom court de chaque ligne de la cagnotte (rouleaux, gagnants)
  const lineName = (p: PoolLineView) => {
    if (p.oneOfOne) return t("oneOfOne");
    const first = p.lot?.lines[0];
    if (first?.kind === "BOOSTER") return tGifts("booster", { count: 1, name: boosterWord(first.name) });
    return p.lot?.name ?? t("lot");
  };
  // Ligne de la cagnotte avec son nombre (« 20 boosters divin », « 1 carte 1/1 au choix »)
  const poolText = (p: PoolLineView) => {
    const first = p.lot?.lines[0];
    if (p.oneOfOne) return t("poolOne", { count: p.count });
    if (first?.kind === "BOOSTER") return tGifts("booster", { count: p.count * first.quantity, name: boosterWord(first.name) });
    return t("poolLine", { count: p.count, name: p.lot?.name ?? t("lot") });
  };
  const lotNames: string[] = [];
  for (const p of view.pool) lotNames[p.line] = lineName(p);
  const poolLine = (line: number) => view.pool.find((p) => p.line === line);

  const myWins = om.draws?.filter((d) => d.me) ?? [];
  // Lots gagnés : versés, encore à verser (le cron s'en charge) ou écartés (compte banni ou supprimé)
  const myState = awardsState(myWins.map((d) => d.state));
  const myLine = om.draws
    ? myWins.length
      ? t("myLineWon", { tickets: om.myTickets, draws: myWins.map((d) => d.n).join(", ") })
      : t("myLineNone", { tickets: om.myTickets })
    : t("myLineBefore", { tickets: om.myTickets });

  return (
    <PageShell>
      <div className="enn flex flex-col gap-4">
        <Link href="/ennichi" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-text-muted hover:text-text">
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
        <div className="flex items-center gap-3">
          <Seal kanji="籤" />
          <div className="min-w-0 flex-1">
            <h1 className="m3-h2 font-heading">{t("title")}</h1>
            {om.draws && <p className="text-xs text-text-muted">{t("drawnOn", { date: dateHour(view.drawnAt) })}</p>}
          </div>
          <OmikujiVerify proof={om.proof} seedHash={view.seedHash} myLine={myLine} drawnAt={view.drawnAt ? dateHour(view.drawnAt) : null} />
          <EnnichiHelp topic="omikuji" view={view} />
        </div>

        {!om.draws ? (
          <div className="m3-kuji">
            <div className="m3-col">
              <section className="flex flex-col gap-2 lacquer rounded-card p-4">
                <b>{view.closesAt ? t("drawOn", { date: dateHour(view.closesAt) }) : t("drawLater")}</b>
                <p className="text-xs text-text-muted">{t("liveHere")}</p>
                <p className="text-xs text-text-muted">
                  {t("seedPublished")}
                  <span className="hash">{view.seedHash ?? "—"}</span>
                </p>
              </section>
              <section className="flex flex-col gap-2 lacquer rounded-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-title text-base font-bold">{t("myTickets")}</h2>
                  <span className="text-xs text-text-muted">{t("onePerFriend")}</span>
                </div>
                {om.myTickets > 0 ? (
                  <div className="tickets">
                    {Array.from({ length: Math.min(om.myTickets, 18) }, (_, i) => (
                      <span key={i} lang="ja" className="ticket" aria-hidden="true">
                        籤
                      </span>
                    ))}
                    {om.myTickets > 18 && <span className="m3-more">+{format.number(om.myTickets - 18)}</span>}
                    <span className="sr-only">{t("ticketsCount", { count: om.myTickets })}</span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-text-muted">{t("noTicket")}</p>
                    {view.phase === "live" && (
                      <Link href="/parrainage" className={buttonClasses("primary", "self-start", "sm")}>
                        {t("invite")}
                      </Link>
                    )}
                  </>
                )}
                <p className="text-xs text-text-muted">{t("serverTickets", { count: om.tickets })}</p>
              </section>
            </div>
            <section className="flex flex-col gap-2 lacquer rounded-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-title text-base font-bold">{t("pool")}</h2>
                <span className="text-xs text-text-muted">{t("lots", { count: om.lots })}</span>
              </div>
              <p className="text-xs text-text-muted">{t("poolRule")}</p>
              <div className="m3-pool">
                {view.pool.map((p) => (
                  <div key={p.line} className="m3-pool-row">
                    <Seal kanji={luckOf(p.line)} size={40} className="text-sm" />
                    <b>{poolText(p)}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="m3-kuji">
            <div className="m3-col">
              <OmikujiReel draws={om.draws} lotNames={lotNames} stageStyle={themedBg("sanctuaire")} />
              {myWins.length > 0 ? (
                <section className="m3-won-card flex flex-col gap-2 lacquer rounded-card border-kin p-4">
                  <b>{t("youWon", { count: myWins.length })}</b>
                  <LotGifts lot={mergeLotViews(myWins.map((d) => poolLine(d.line)?.lot ?? null))} />
                  {myWins.some((d) => poolLine(d.line)?.oneOfOne) && (
                    <Link href="/parrainage/bons" className={buttonClasses("primary", "self-start", "sm")}>
                      {t("chooseOneOfOne")}
                    </Link>
                  )}
                  <p className="text-xs text-text-muted">
                    {myState === "SKIPPED"
                      ? t("skippedAlone")
                      : t(myState === "PENDING" ? "payingAlone" : "paidAlone", { left: Math.max(0, om.myTickets - myWins.length) })}
                  </p>
                </section>
              ) : (
                <section className="flex flex-col gap-1 lacquer rounded-card p-4">
                  <b>{om.myTickets ? t("noLuck") : t("noTicketThen")}</b>
                  <p className="text-xs text-text-muted">{om.myTickets ? t("noLuckBody", { count: om.myTickets }) : t("noTicketThenBody")}</p>
                </section>
              )}
            </div>
            <section className="wins" aria-label={t("winners")}>
              {view.pool.map((p) => {
                const ds = om.draws!.filter((d) => d.line === p.line);
                if (!ds.length) return null;
                const byName = new Map<string, { name: string; me: boolean; n: number }>();
                for (const d of ds) {
                  const key = d.me ? "\u0000me" : d.name;
                  const x = byName.get(key) ?? { name: d.name, me: d.me, n: 0 };
                  x.n++;
                  byName.set(key, x);
                }
                const list = [...byName.values()].sort((a, b) => Number(b.me) - Number(a.me) || b.n - a.n);
                return (
                  <div key={p.line} className="win-g lacquer rounded-card">
                    <h3>
                      <span lang="ja" className="k">
                        {luckOf(p.line)}
                      </span>
                      {t("winnersOf", { name: lotNames[p.line], count: list.length })}
                    </h3>
                    <div className="win-names">
                      {list.slice(0, 10).map((w) => (
                        <span key={w.me ? "me" : w.name} className={w.me ? "me" : ""}>
                          {w.me ? t("you") : w.name}
                          {w.n > 1 ? ` ×${w.n}` : ""}
                        </span>
                      ))}
                      {list.length > 10 && <span>+{format.number(list.length - 10)}</span>}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}
