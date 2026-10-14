import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ClaimReferralButton } from "@/components/economy/ClaimButton";
import { LotRewards } from "@/components/economy/LotRewards";
import { LotStage } from "@/components/economy/LotStage";
import { RefereeChecklist } from "@/components/economy/RefereeChecklist";
import { ReferralCodeForm } from "@/components/economy/ReferralCodeForm";
import { ReferralShare } from "@/components/economy/ReferralShare";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { RefereeProgress } from "@/lib/economy/referral";
import { guestCode } from "@/lib/username";
import { prisma } from "@/server/db";
import { referralRules } from "@/server/economy/deps";
import { lotViews, type LotView } from "@/server/economy/lot-view";
import { pendingReferralCode } from "@/server/economy/referral";
import { qualifyReferralsWith, refereeProgress } from "@/server/economy/referral-core";
import { pushNotifications } from "@/server/push/send";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const DAY = 86_400_000;
const STEP_KANJI = ["一", "二", "三"] as const;

/** Une récompense de parrainage sur sa scène (pour le parrain ou pour le filleul). */
function RewardCard({ title, lot, empty }: { title: string; lot: LotView | undefined; empty: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <LotStage lot={lot} className="h-32" />
      <div className="flex flex-col gap-2 p-3">
        <p className="text-sm font-bold">{title}</p>
        {lot ? <LotRewards lot={lot} /> : <p className="text-sm text-text-muted">{empty}</p>}
      </div>
    </div>
  );
}

/** Parrainage : son code, ses filleuls et leur progression, son propre parrain. */
export default async function ReferralPage() {
  const [t, tAccount, user, locale] = await Promise.all([
    getTranslations("economy.referral"),
    getTranslations("account"),
    getCurrentUser(),
    getLocale(),
  ]);
  if (!user) {
    return (
      <PageShell>
        <GuestBootstrap />
      </PageShell>
    );
  }

  const rules = await referralRules();
  const now = new Date();
  const header = <SectionTitle level={1} kanji="招待" title={t("title")} subtitle={t("intro")} />;

  if (!rules.enabled) {
    return (
      <PageShell>
        {header}
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-text-muted">{t("disabled")}</p>
      </PageShell>
    );
  }

  const [referrerLotId, refereeLotId, cookieCode] = await Promise.all([
    getSetting("referral.referrerLotId"),
    getSetting("referral.refereeLotId"),
    pendingReferralCode(),
  ]);
  const lots = await lotViews([referrerLotId, refereeLotId].filter((id): id is string => id !== null), locale);

  const rewards = (
    <div className="grid grid-cols-2 gap-3">
      <RewardCard title={t("rewardReferrer")} lot={referrerLotId ? lots.get(referrerLotId) : undefined} empty={t("noReward")} />
      <RewardCard title={t("rewardReferee")} lot={refereeLotId ? lots.get(refereeLotId) : undefined} empty={t("noReward")} />
    </div>
  );
  const howItWorks = (
    <section className="flex flex-col gap-3" aria-labelledby="comment">
      <h2 id="comment" className="font-title text-lg font-bold">
        {t("howTitle")}
      </h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          t("how1"),
          t("how2", { hours: rules.minAccountAgeHours, boosters: rules.minBoostersOpened }),
          t("how3"),
        ].map((text, i) => (
          <li key={i} className="relative flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
            <span
              aria-hidden="true"
              lang="ja"
              className="flex size-10 shrink-0 items-center justify-center rounded-[4px] bg-shu-btn font-seal text-xl text-washi-paper"
            >
              {STEP_KANJI[i]}
            </span>
            <p className="text-sm leading-relaxed">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );

  // Invités : pas de parrainage tant qu'ils n'ont pas de compte (anti-multicomptes)
  if (user.isGuest) {
    return (
      <PageShell>
        {header}
        <section className="flex flex-col gap-3 rounded-xl border border-kin/60 bg-[linear-gradient(135deg,var(--color-surface),var(--color-surface-2))] p-5">
          <p className="font-title text-lg font-bold">{cookieCode ? t("guestInvited") : t("guestBody")}</p>
          <ButtonLink href="/inscription" variant="shu" className="self-start">
            {tAccount("createAccount")}
          </ButtonLink>
        </section>
        {rewards}
        {howItWorks}
      </PageShell>
    );
  }

  // Qualification paresseuse : la visite suffit à faire avancer les parrainages prêts
  await qualifyReferralsWith(prisma, user.id, rules, now, (ids) => void pushNotifications(ids));

  const [me, referees, mine] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { referralCode: true, createdAt: true } }),
    prisma.referral.findMany({
      where: { referrerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        referrerClaimedAt: true,
        referee: { select: { id: true, username: true, isGuest: true } },
      },
    }),
    prisma.referral.findUnique({
      where: { refereeId: user.id },
      select: { id: true, status: true, refereeClaimedAt: true, createdAt: true, referrer: { select: { username: true } } },
    }),
  ]);

  const pending = await Promise.all(
    referees.filter((r) => r.status === "PENDING").map(async (r) => [r.id, await refereeProgress(prisma, r.referee.id, r.createdAt)] as const),
  );
  const progressById = new Map<string, RefereeProgress | null>(pending);
  const canAttach = !mine && now.getTime() - me.createdAt.getTime() <= rules.attachWindowDays * DAY;
  const myProgress = mine?.status === "PENDING" ? await refereeProgress(prisma, user.id, mine.createdAt) : null;
  const qualifiedCount = referees.filter((r) => r.status === "QUALIFIED").length;

  const nameOf = (u: { username: string; isGuest: boolean }) => {
    const code = guestCode(u.username);
    return u.isGuest && code ? tAccount("guestName", { code }) : u.username;
  };
  const statusChip = (status: "PENDING" | "QUALIFIED" | "REVOKED"): ReactNode => (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        status === "QUALIFIED" ? "bg-kin/15 text-kin" : status === "REVOKED" ? "bg-shu/15 text-shu" : "bg-surface-2 text-text-muted"
      }`}
    >
      {t(`status.${status}`)}
    </span>
  );

  return (
    <PageShell>
      {header}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        {/* Carte d'invitation : le code comme une étiquette tanzaku, bordure dorée */}
        <section className="relative flex flex-col gap-4 overflow-hidden rounded-xl border border-kin/60 bg-[linear-gradient(135deg,var(--color-surface),var(--color-surface-2))] p-5 shadow-paper">
          <span aria-hidden="true" lang="ja" className="pointer-events-none absolute -right-3 -bottom-6 font-seal text-[7rem] leading-none text-kin/10">
            招
          </span>
          <h2 className="font-title text-xl font-bold">{t("inviteTitle")}</h2>
          <p className="max-w-prose text-sm text-text-muted">{t("inviteBody")}</p>
          <ReferralShare code={me.referralCode} />
          <dl className="flex gap-6 border-t border-dashed border-border pt-3 text-sm">
            <div>
              <dt className="text-text-muted">{t("statInvited")}</dt>
              <dd className="text-xl font-bold tabular-nums">{referees.length}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{t("statQualified")}</dt>
              <dd className="text-xl font-bold tabular-nums text-kin">{qualifiedCount}</dd>
            </div>
          </dl>
        </section>
        {rewards}
      </div>

      {howItWorks}

      <section className="flex flex-col gap-3" aria-labelledby="filleuls">
        <h2 id="filleuls" className="font-title text-lg font-bold">
          {t("refereesTitle", { count: referees.length })}
        </h2>
        {referees.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">{t("refereesEmpty")}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {referees.map((r) => {
              const progress = progressById.get(r.id);
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 font-title font-bold uppercase"
                      >
                        {nameOf(r.referee).slice(0, 1)}
                      </span>
                      <p className="truncate font-bold">{nameOf(r.referee)}</p>
                    </div>
                    {statusChip(r.status)}
                  </div>
                  {r.status === "PENDING" && progress && <RefereeChecklist progress={progress} rules={rules} now={now} />}
                  {r.status === "QUALIFIED" && referrerLotId && (
                    <div className="flex justify-end">
                      <ClaimReferralButton referralId={r.id} claimed={r.referrerClaimedAt !== null} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-title text-lg font-bold">{t("myReferrerTitle")}</h2>
        {mine ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>{t("referredBy", { name: mine.referrer.username })}</p>
              {statusChip(mine.status)}
            </div>
            {mine.status === "PENDING" && myProgress && <RefereeChecklist progress={myProgress} rules={rules} now={now} />}
            {mine.status === "QUALIFIED" && refereeLotId && (
              <div className="flex justify-end">
                <ClaimReferralButton referralId={mine.id} claimed={mine.refereeClaimedAt !== null} />
              </div>
            )}
          </div>
        ) : canAttach ? (
          <ReferralCodeForm initialCode={cookieCode ?? ""} />
        ) : (
          <p className="text-sm text-text-muted">{t("tooLate", { days: rules.attachWindowDays })}</p>
        )}
      </section>
    </PageShell>
  );
}
