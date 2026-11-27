import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PrivateNameLock } from "@/components/social/PrivateNameLock";
import { Link } from "@/i18n/navigation";
import { publicNamesFor } from "@/server/collection/public-names";
import { referralV2Rules } from "@/server/referral/deps";
import { legendWall } from "@/server/referral/legends";
import { installedCount } from "@/server/referral/payout-core";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export async function generateMetadata(): Promise<Metadata> {
  const [t, rules] = await Promise.all([getTranslations("referralV2.legends"), referralV2Rules()]);
  const threshold = rules.milestones.find((m) => m.legend)?.installed ?? 100;
  return { title: t("title"), description: t("lead", { count: threshold }), robots: { index: false, follow: true } };
}

/** Papier du rouleau : fibres du washi sur une crème chaude, la même en Yoru et en Washi. */
const PAPER = { background: "repeating-linear-gradient(97deg, rgb(120 100 70 / 0.06) 0 1px, transparent 1px 5px), #f1e8d5" };

function RollBar() {
  return <div aria-hidden="true" className="h-4 bg-linear-to-b from-[#2a1f1f] to-[#0e0a0a] shadow-[inset_0_-2px_0_#b8902f]" />;
}

/**
 * Mur des légendes (maquette « Rouleau d'honneur ») : les joueurs qui ont amené assez d'amis installés, dans l'ordre où
 * ils ont atteint le palier ; le premier porte le sceau 壱. Le joueur connecté se repère (« toi ») ou voit où il en est.
 */
export default async function LegendsPage() {
  const [t, format, rules, user, timeZone] = await Promise.all([
    getTranslations("referralV2.legends"),
    getFormatter(),
    referralV2Rules(),
    getCurrentUser(),
    getSetting("game.timeZone"),
  ]);
  const wall = await legendWall(rules);
  const threshold = wall.threshold ?? 100;
  const me = user && !user.isGuest ? user.id : null;
  const onWall = me !== null && wall.entries.some((e) => e.player.id === me);
  // Pseudos selon la visibilité du profil (un profil privé reste anonyme, sauf pour lui-même et un admin)
  const [mine, shownName] = await Promise.all([
    me && !onWall ? installedCount(prisma, me) : null,
    publicNamesFor(me, wall.entries.map((e) => e.player)),
  ]);

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Link href="/parrainage" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-text-muted hover:text-text">
          <span aria-hidden="true">←</span> {t("back")}
        </Link>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" lang="ja" className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-shu-btn font-seal text-xl text-washi-paper">
            絵
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl">{t("title")}</h1>
            <p className="text-sm text-text-muted">{t("lead", { count: threshold })}</p>
          </div>
        </div>

        <section aria-label={t("rollLabel")} className="flex flex-col overflow-hidden rounded-lg shadow-float">
          <RollBar />
          <ol className="flex flex-col gap-2.5 px-4 py-3.5 text-sumi" style={PAPER}>
            {wall.entries.length === 0 ? (
              <li className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5">
                <span aria-hidden="true" lang="ja" className="flex size-8 items-center justify-center rounded-[5px] font-seal text-base text-[#b3261e] opacity-55 shadow-[inset_0_0_0_1.5px_#b3261e]">
                  壱
                </span>
                <span className="min-w-0">
                  <b className="font-title font-extrabold">{t("emptyTitle")}</b>
                  <br />
                  <span className="text-xs text-[#5c544a]">{t("emptyBody", { count: threshold })}</span>
                </span>
              </li>
            ) : (
              wall.entries.map((e, i) => {
                const isMe = e.player.id === me;
                const shown = shownName(e.player);
                return (
                  <li key={e.player.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[rgb(31_27_23/0.12)] pb-2 last:border-b-0 last:pb-0">
                    <span aria-hidden="true" lang="ja" className="flex size-8 items-center justify-center rounded-sm bg-shu-btn font-seal text-base text-washi-paper">
                      {i === 0 ? "壱" : "縁"}
                    </span>
                    <span className="min-w-0">
                      <b className={`font-title font-extrabold ${isMe ? "text-[#8e2018]" : ""}`}>{shown.name}</b>
                      {shown.revealed && <PrivateNameLock className="ml-1 align-[-2px] text-[#5c544a]" />}
                      {isMe && <span className="ml-1.5 inline-block rounded-pill bg-[#c8372d] px-1.5 align-[2px] text-[10.5px] font-bold text-[#f8f2e4]">{t("me")}</span>}
                      <br />
                      <span className="text-xs text-[#5c544a]">{t("friends", { count: e.installed })}</span>
                    </span>
                    <span className="text-xs text-[#5c544a]">{format.dateTime(e.at, { month: "short", year: "numeric", timeZone })}</span>
                  </li>
                );
              })
            )}
          </ol>
          <RollBar />
        </section>

        {mine !== null && <p className="text-xs text-text-muted">{t("you", { count: mine, threshold })}</p>}
      </div>
    </PageShell>
  );
}
