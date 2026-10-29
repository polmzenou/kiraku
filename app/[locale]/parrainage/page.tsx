import { after } from "next/server";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ClaimReferralButton } from "@/components/economy/ClaimButton";
import { RefereeChecklist } from "@/components/economy/RefereeChecklist";
import { ReferralCodeForm } from "@/components/economy/ReferralCodeForm";
import { ReferralMilestones } from "@/components/economy/ReferralMilestones";
import { ReferralShare } from "@/components/economy/ReferralShare";
import { GuestBootstrap } from "@/components/GuestBootstrap";
import { PageShell } from "@/components/PageShell";
import { SectionTitle } from "@/components/SectionTitle";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { milestoneStates, normalizeReferralCode, type RefereeProgress } from "@/lib/economy/referral";
import { baseOpenGraph, OG_IMAGE_SIZE, ogImageUrl } from "@/lib/seo/open-graph";
import { routing } from "@/i18n/routing";
import { guestCode } from "@/lib/username";
import { prisma } from "@/server/db";
import { referralRules } from "@/server/economy/deps";
import { lotViews } from "@/server/economy/lot-view";
import { pendingReferralCode } from "@/server/economy/referral";
import { referrerByCode } from "@/server/og/data";
import { qualifyReferralsWith, refereeProgress } from "@/server/economy/referral-core";
import { pushNotifications } from "@/server/push/send";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";

/**
 * Arrivée par un lien d'invitation (/i/CODE redirige ici avec `?parrain=CODE`) : aperçu « Pseudo veut
 * te parrainer ! » pour Discord, WhatsApp, X… avec l'image du parrain. Page jamais indexée.
 */
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/parrainage">): Promise<Metadata> {
  const [{ locale: raw }, { parrain }] = await Promise.all([params, searchParams]);
  const robots = { index: false, follow: false };
  const code = normalizeReferralCode(parrain);
  if (!code) return { robots };
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const [t, referrer] = await Promise.all([getTranslations({ locale, namespace: "metadata" }), referrerByCode(code).catch(() => null)]);
  const title = referrer ? t("inviteTitle", { name: referrer.username }) : t("inviteTitleGeneric");
  const description = t("inviteDescription");
  const image = { url: ogImageUrl(locale, `/og-image/parrainage/${code}`), ...OG_IMAGE_SIZE, alt: title };
  return {
    robots,
    title: { absolute: title },
    description,
    openGraph: { ...baseOpenGraph(locale), title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

const DAY = 86_400_000;
const STEP_KANJI = ["一", "二", "三"] as const;

/** Parrainage : son code, ses paliers, ses filleuls et leur progression, son propre parrain. */
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
        <p className="lacquer rounded-card p-6 text-center text-text-muted">{t("disabled")}</p>
      </PageShell>
    );
  }

  const [referrerLotId, refereeLotId, milestones, recruiterReferrals, cookieCode] = await Promise.all([
    getSetting("referral.referrerLotId"),
    getSetting("referral.refereeLotId"),
    getSetting("referral.milestones"),
    getSetting("profile.recruiterReferrals"),
    pendingReferralCode(),
  ]);
  const lots = await lotViews(
    [referrerLotId, refereeLotId, ...milestones.map((m) => m.lotId)].filter((id): id is string => id !== null),
    locale,
  );

  // Paliers à droite du code ; un invité les voit tous verrouillés, sans bouton
  const rewards = (qualified: number, claimed: ReadonlySet<number>, canClaim: boolean) => (
    <ReferralMilestones
      milestones={milestoneStates(milestones, qualified, claimed)}
      lots={lots}
      qualified={qualified}
      recruiterReferrals={recruiterReferrals}
      referrerLot={referrerLotId ? lots.get(referrerLotId) : undefined}
      refereeLot={refereeLotId ? lots.get(refereeLotId) : undefined}
      canClaim={canClaim}
    />
  );
  const howItWorks = (
    <section className="flex flex-col gap-3" aria-labelledby="comment">
      <h2 id="comment" className="font-heading text-lg font-bold">
        {t("howTitle")}
      </h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          t("how1"),
          t("how2", { hours: rules.minAccountAgeHours, boosters: rules.minBoostersOpened }),
          t("how3"),
        ].map((text, i) => (
          <li key={i} className="relative flex items-start gap-3 lacquer rounded-card p-4">
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
        <section className="flex flex-col gap-3 rounded-card border border-kin/60 bg-[linear-gradient(135deg,var(--color-surface),var(--color-surface-2))] p-5">
          <p className="font-title text-lg font-bold">{cookieCode ? t("guestInvited") : t("guestBody")}</p>
          <ButtonLink href="/inscription" variant="primary" className="self-start">
            {tAccount("createAccount")}
          </ButtonLink>
        </section>
        {rewards(0, new Set(), false)}
        {howItWorks}
      </PageShell>
    );
  }

  // Qualification paresseuse : la visite suffit à faire avancer les parrainages prêts
  await qualifyReferralsWith(prisma, user.id, rules, now, (ids) => after(() => pushNotifications(ids)));

  const [me, referees, mine, qualifiedCount, claims] = await Promise.all([
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
    // Tous les qualifiés, pas seulement les 50 derniers affichés : c'est ce qui fait avancer les paliers
    prisma.referral.count({ where: { referrerId: user.id, status: "QUALIFIED" } }),
    prisma.referralMilestoneClaim.findMany({ where: { userId: user.id }, select: { referrals: true } }),
  ]);

  const pending = await Promise.all(
    referees.filter((r) => r.status === "PENDING").map(async (r) => [r.id, await refereeProgress(prisma, r.referee.id, r.createdAt)] as const),
  );
  const progressById = new Map<string, RefereeProgress | null>(pending);
  const canAttach = !mine && now.getTime() - me.createdAt.getTime() <= rules.attachWindowDays * DAY;
  const myProgress = mine?.status === "PENDING" ? await refereeProgress(prisma, user.id, mine.createdAt) : null;

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
        <section className="relative flex flex-col gap-4 overflow-hidden rounded-card border border-kin/60 bg-[linear-gradient(135deg,var(--color-surface),var(--color-surface-2))] p-5">
          <span aria-hidden="true" lang="ja" className="pointer-events-none absolute -right-3 -bottom-6 font-seal text-[7rem] leading-none text-kin/10">
            招
          </span>
          <h2 className="font-heading text-xl font-bold">{t("inviteTitle")}</h2>
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
        {rewards(qualifiedCount, new Set(claims.map((c) => c.referrals)), true)}
      </div>

      {howItWorks}

      <section
        className="flex flex-col gap-4 rounded-card border border-shu/40 border-l-4 border-l-shu bg-surface bg-linear-to-br from-shu/10 via-surface to-surface p-5 sm:p-6"
        aria-labelledby="parrain"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            lang="ja"
            className="flex size-10 shrink-0 items-center justify-center rounded-control bg-shu-btn font-seal text-2xl text-washi-paper"
          >
            招
          </span>
          <h2 id="parrain" className="font-heading text-xl font-extrabold">{t("myReferrerTitle")}</h2>
        </div>
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

      <section className="flex flex-col gap-3" aria-labelledby="filleuls">
        <h2 id="filleuls" className="font-heading text-lg font-bold">
          {t("refereesTitle", { count: referees.length })}
        </h2>
        {referees.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">{t("refereesEmpty")}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {referees.map((r) => {
              const progress = progressById.get(r.id);
              return (
                <li key={r.id} className="flex flex-col gap-3 lacquer rounded-card p-4">
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
    </PageShell>
  );
}
