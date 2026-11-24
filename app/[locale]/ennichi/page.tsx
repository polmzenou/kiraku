import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { countdownTarget, streetLit } from "@/components/ennichi/EnnichiBanner";
import { Countdown } from "@/components/ennichi/Countdown";
import { EnnichiHelp } from "@/components/ennichi/Help";
import { Seal, Street } from "@/components/ennichi/parts";
import "@/components/ennichi/ennichi.css";
import { PageShell } from "@/components/PageShell";
import { LotGifts } from "@/components/referral/LotGifts";
import { buttonClasses } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { banzukeView, ennichiView, myFete, type EnnichiView, type MyFete } from "@/server/ennichi/queries";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ennichi");
  return { title: t("title"), description: t("metaDescription") };
}

function Box({ n, label, className = "" }: { n: string; label: string; className?: string }) {
  return (
    <div className="lacquer rounded-card p-2.5 text-center">
      <b className={`block text-2xl tabular-nums ${className}`}>{n}</b>
      <span className="text-[11.5px] text-text-muted">{label}</span>
    </div>
  );
}

/** « Ta fête » : amis arrivés et installés, tickets, place au banzuke, cadeaux des lanternes. */
async function MyFeteCard({ view, mine, rank }: { view: EnnichiView; mine: MyFete | null; rank: number | null }) {
  const [t, format] = await Promise.all([getTranslations("ennichi.page"), getFormatter()]);
  const live = view.phase === "live";
  const elig = mine?.eligible ?? false;
  const eligText = elig ? t("eligible") : view.phase === "closed" ? t("eligibleClosed") : t("notEligible");
  const eligLine = (
    <div className={`elig${elig ? "" : " m3-no"}`}>
      <span aria-hidden="true" lang="ja" className="seal flex shrink-0 items-center justify-center rounded-sm font-seal">
        {elig ? "✓" : "灯"}
      </span>
      <span>{eligText}</span>
    </div>
  );
  const pill = rank ? (
    <span className="rounded-pill border border-kin/60 px-2.5 py-0.5 text-xs font-bold text-kin">{t("rank", { rank })}</span>
  ) : (
    <span className="rounded-pill border border-border px-2.5 py-0.5 text-xs font-bold text-text-muted">{view.phase === "closed" ? t("unranked") : t("notYetRanked")}</span>
  );
  if (!mine || mine.arrived === 0) {
    return (
      <section className="m3-a-mine flex flex-col gap-3 lacquer rounded-card p-4">
        <h2 className="m3-h3">{t("nobodyYet")}</h2>
        <p className="text-xs text-text-muted">{t("nobodyBody")}</p>
        {live && (
          <Link href="/parrainage" className={buttonClasses("primary", "self-start")}>
            {t("invite")}
          </Link>
        )}
        {eligLine}
      </section>
    );
  }
  return (
    <section className="m3-a-mine flex flex-col gap-3 lacquer rounded-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m3-h3">{t("mine")}</h2>
        {pill}
      </div>
      <div className="mine">
        <Box n={format.number(mine.arrived)} label={t("arrived", { count: mine.arrived })} />
        <Box n={format.number(mine.installed)} label={t("installed", { count: mine.installed })} className="text-hisui" />
        <Box n={format.number(mine.installed)} label={t("tickets", { count: mine.installed })} />
      </div>
      {mine.received && (
        <div className="m3-won">
          <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{t("received")}</span>
          <LotGifts lot={mine.received} compact />
          {mine.receivedVouchers > 0 && <span className="text-xs font-bold">{t("vouchers", { count: mine.receivedVouchers })}</span>}
        </div>
      )}
      {eligLine}
    </section>
  );
}

/**
 * Page de la fête (maquette « Ta fête d'abord ») : la rue des lanternes en haut, ta fête, les trois parties (lanternes,
 * banzuke, omikuji) avec leur « ? », le compte à rebours. Hors fête, une phrase.
 */
export default async function EnnichiPage() {
  const [t, format, locale, user] = await Promise.all([getTranslations("ennichi"), getFormatter(), getLocale(), getCurrentUser()]);
  const view = await ennichiView(locale);
  if (view.phase === "off" || view.phase === "before") {
    return (
      <PageShell>
        <section className="flex flex-col gap-3 lacquer rounded-card p-4">
          <div className="flex items-center gap-3">
            <Seal kanji="祭" />
            <h1 className="font-heading text-2xl">{t("title")}</h1>
          </div>
          <p>{view.phase === "before" && view.startsAt ? t("page.startsOn", { date: format.dateTime(new Date(view.startsAt), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) }) : t("page.off")}</p>
        </section>
      </PageShell>
    );
  }
  const member = user && !user.isGuest ? user : null;
  const [mine, bz] = await Promise.all([member ? myFete(member.id, view) : null, member ? banzukeView(view, member.id) : null]);
  const live = view.phase === "live";
  const target = countdownTarget(view);
  const dateHour = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "");

  const tile = (kanji: string, href: "/ennichi/lanternes" | "/ennichi/banzuke" | "/ennichi/omikuji", name: string, say: string, topic: "lanternes" | "banzuke" | "omikuji") => (
    <div className="tile lacquer rounded-card">
      <Link href={href} className="tile-go">
        <Seal kanji={kanji} size={44} />
        <span className="tile-t">
          <b>{name}</b>
          <span className="tile-p">{say}</span>
        </span>
      </Link>
      <EnnichiHelp topic={topic} view={view} />
    </div>
  );

  return (
    <PageShell>
      <div className="enn">
        <div className="m3-page">
          <Street {...streetLit(view)} hero className="m3-a-hero">
            <div className="ehero-in">
              <span className="m3-on-img text-xs font-bold tracking-wide uppercase">
                {t("page.days", { count: view.days })}
                {live && view.dayIndex ? ` · ${t("page.day", { n: view.dayIndex })}` : ""}
              </span>
              <h1>{t("title")}</h1>
              <div className="m3-chips">
                <span className="count-chip">{view.phase === "closed" ? t("phase.closed") : t(`phase.${view.phase}`)}</span>
                {live && <span className="x2">{t("x2", { n: view.multiplier })}</span>}
                <EnnichiHelp topic="fete" view={view} />
              </div>
            </div>
          </Street>

          <MyFeteCard view={view} mine={mine} rank={bz?.me?.rank ?? null} />

          <div className="tiles m3-a-tiles">
            {tile("灯", "/ennichi/lanternes", t("parts.lanternes"), t("parts.lanternesSay"), "lanternes")}
            {tile("番", "/ennichi/banzuke", t("parts.banzuke"), t("parts.banzukeSay"), "banzuke")}
            {tile("籤", "/ennichi/omikuji", t("parts.omikuji"), view.drawnAt ? t("parts.omikujiDone") : t("parts.omikujiSay", { date: dateHour(view.closesAt) }), "omikuji")}
          </div>

          <section className="m3-a-cd flex flex-col gap-2 lacquer rounded-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-wide text-text-muted uppercase">{t(`phase.${view.phase}`)}</span>
              {target && view.phase !== "closed" && <Countdown target={target} serverNow={new Date().toISOString()} />}
            </div>
            <p className="text-xs text-text-muted">
              {view.phase === "closed"
                ? t("page.closedSub", { date: dateHour(view.drawnAt) })
                : view.phase === "closing"
                  ? t("page.closingSub", { days: view.closingDays, date: dateHour(view.closesAt) })
                  : t("page.liveSub", { end: dateHour(view.endsAt), days: view.closingDays })}
            </p>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
