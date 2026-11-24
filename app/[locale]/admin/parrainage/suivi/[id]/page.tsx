import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ReasonChips, ScoreBadge } from "@/components/admin/MultiAccount";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { ReviewActions } from "@/components/admin/referral/ReviewActions";
import { TrackingStatusPill } from "@/components/admin/referral/TrackingStatusPill";
import { LotGifts } from "@/components/referral/LotGifts";
import { STEP_KANJI, stepNo } from "@/components/referral/step-meta";
import { Link } from "@/i18n/navigation";
import { canManageReferrals } from "@/lib/admin/roles";
import { requireAdminView } from "@/server/admin";
import { heldReferralCount } from "@/server/referral/admin-queries";
import { referralV2Rules } from "@/server/referral/deps";
import { referralFiche, type FicheReward } from "@/server/referral/tracking-queries";
import { getSetting } from "@/server/settings";

function Seal({ kanji, muted = false }: { kanji: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      lang="ja"
      className={`flex size-8 shrink-0 items-center justify-center rounded-sm font-seal text-sm ${muted ? "border border-border text-text-muted" : "bg-shu-btn text-washi-paper"}`}
    >
      {kanji}
    </span>
  );
}

function Row({ seal, muted, title, when, children }: { seal: string; muted?: boolean; title: ReactNode; when: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Seal kanji={seal} muted={muted} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <b>{title}</b>
          <span className="text-xs text-text-muted">{when}</span>
        </p>
        {children}
      </div>
    </li>
  );
}

/**
 * Fiche d'un parrainage v2 (design « deux colonnes » de l'atelier équipe) : à gauche, son déroulé (rattachement,
 * étapes et ce qu'elles ont versé, blocage, paliers, grand-parrainage, décisions) et les actions ; à droite, la paire,
 * le filleul et le parrain. Les IP ne sont jamais affichées en clair.
 */
export default async function AdminReferralFichePage({ params }: PageProps<"/[locale]/admin/parrainage/suivi/[id]">) {
  const { user } = await requireAdminView();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound();
  const now = new Date();
  const [t, tSteps, format, locale, rules, timeZone, sharedCap, held] = await Promise.all([
    getTranslations("admin.referralV2.fiche"),
    getTranslations("referralV2.steps"),
    getFormatter(),
    getLocale(),
    referralV2Rules(),
    getSetting("game.timeZone"),
    getSetting("multiAccount.sharedIpCap"),
    heldReferralCount(),
  ]);
  const fiche = await referralFiche(id, rules, { timeZone, locale, now, sharedCap });
  if (!fiche) notFound();

  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
  const day = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric", timeZone });
  const ago = (iso: string) => format.relativeTime(new Date(iso), now);
  const payLine = (w: FicheReward) => (
    <div key={`${w.kind}-${w.side}-${w.at}`} className={`flex flex-wrap items-center gap-2 text-xs ${w.clawedBack ? "opacity-60" : ""}`}>
      <span className="text-text-muted">{t("who", { kind: w.kind, side: w.side ?? "NONE", name: w.to })}</span>
      <LotGifts lot={w.lot} multiplier={w.multiplier} compact />
      {w.clawedBack && <span className="rounded-pill border border-shu/60 px-2 font-bold text-shu">{t("clawedBack")}</span>}
    </div>
  );
  const blocked = fiche.status === "HELD";
  const state = fiche.status === "HELD" ? "HELD" : fiche.status === "BANNED" ? "BANNED" : fiche.status === "REVOKED" ? "REVOKED" : "ACTIVE";

  const timeline = (
    <section className="flex flex-col gap-4 lacquer rounded-card p-4" aria-labelledby="deroule">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="deroule" className="font-title text-lg font-bold">
          {fiche.referee.name} <span aria-hidden="true">→</span>
          <span className="sr-only"> {t("referredBy")} </span> {fiche.referrer.name}
        </h3>
        <TrackingStatusPill status={fiche.status} />
      </div>
      <ol className="flex flex-col gap-4">
        <Row seal="招" title={t("attach")} when={`${date(fiche.attachedAt)}${fiche.ennichiEdition ? ` · ${t("ennichi")}` : ""}`} />
        {fiche.steps.map((s, i) => {
          const n = stepNo(i + 1);
          const when = s.at
            ? date(s.at)
            : s.state === "MISSED"
              ? t("missed")
              : blocked
                ? t("waitingTeam")
                : s.state === "NEXT"
                  ? t("ongoing", { have: s.have, need: s.need })
                  : s.deadline
                    ? t("until", { date: day(s.deadline) })
                    : t("later");
          return (
            <Row key={n} seal={STEP_KANJI[i]} muted={!s.at} title={tSteps(`${n}.name`)} when={when}>
              {s.at && blocked && s.rewards.length === 0 && <span className="self-start rounded-pill border border-shu/60 px-2 text-xs font-bold text-shu">{t("blocked")}</span>}
              {s.rewards.map(payLine)}
              {s.at && i < 2 && fiche.trust === "MEDIUM" && rules.stepLots[i].referrerTrust && !s.rewards.some((w) => w.kind === "TRUST_BONUS") && (
                <p className="text-xs text-kin">{t("trustKept")}</p>
              )}
            </Row>
          );
        })}
        {fiche.events.map((e, i) => (
          <Row
            key={`${e.kind}-${i}`}
            seal={e.kind === "HOLD" ? "待" : e.kind === "MILESTONE" ? "階" : e.kind === "GRAND" ? "孫" : "決"}
            title={
              e.kind === "HOLD"
                ? t("hold", { reason: e.text ?? "SCORE" })
                : e.kind === "DECISION"
                  ? t("decision", { decision: e.decision ?? "REVOKED" })
                  : e.kind === "MILESTONE"
                    ? t("milestone", { count: e.reward?.milestone ?? 0 })
                    : t("grand")
            }
            when={`${date(e.at)}${e.by ? ` · ${e.by}` : ""}`}
          >
            {e.reason && <p className="text-xs text-text-muted">{e.reason}</p>}
            {e.reward && payLine(e.reward)}
          </Row>
        ))}
      </ol>
      {canManageReferrals(user.role) && <ReviewActions referralId={fiche.id} state={state} />}
    </section>
  );

  const facts = (rows: [string, ReactNode][]) => (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-muted">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
  const yes = (v: boolean) => (v ? <b className="text-shu">{t("yes")}</b> : <b className="text-text-muted">{t("no")}</b>);
  const { referee, referrer, pair } = fiche;

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="tracking" held={held} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <Link href="/admin/parrainage/suivi" className="text-sm font-bold text-link underline underline-offset-4">
          {t("back")}
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">{timeline}</div>
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="paire">
            <h3 id="paire" className="font-title text-lg font-bold">{t("pair")}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <ScoreBadge score={pair.live.score} label={t("score", { score: pair.live.score })} />
              <span className="text-xs text-text-muted">{t("scoreHint", { threshold: rules.holdScore })}</span>
            </div>
            <ul className="flex flex-wrap gap-2 text-xs">
              <li className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-2 px-3 py-1">
                {t("sharedDevice")} {yes(pair.sharedDevice)}
              </li>
              <li className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-2 px-3 py-1">
                {t("sharedIp")} {yes(pair.sharedIp)}
              </li>
            </ul>
            {pair.live.reasons.length > 0 && <ReasonChips reasons={pair.live.reasons} members={fiche.members} masked pair={{ a: referee.id, b: referrer.id }} />}
            <p className="text-xs text-text-muted">
              {pair.scoredAt ? t("storedScore", { score: pair.score ?? 0, date: date(pair.scoredAt) }) : t("neverScored")} {t("noIp")}
            </p>
          </section>

          <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="filleul">
            <h3 id="filleul" className="font-title text-lg font-bold">{t("refereeTitle", { name: referee.name })}</h3>
            {facts([
              [t("account"), t("since", { date: day(referee.since), ago: ago(referee.since) })],
              [t("via"), referee.via === "DISCORD" ? (referee.discordCreatedAt ? t("viaDiscordAge", { ago: ago(referee.discordCreatedAt) }) : t("viaDiscord")) : t(`via${referee.via}`)],
              [t("trust"), <span key="trust" className={fiche.trust === "HIGH" ? "text-hisui" : "text-kin"}>{t(`trustLevel.${fiche.trust}`)}</span>],
              [t("openings"), format.number(referee.openings)],
              [t("activeDays"), format.number(referee.activeDays)],
              [t("transfers"), referee.cardLockUntil ? t("lockedUntil", { date: day(referee.cardLockUntil) }) : t("free")],
              ...(referee.banned ? ([[t("state"), <b key="ban" className="text-shu">{t("banned")}</b>]] as [string, ReactNode][]) : []),
            ])}
            <Link href={`/admin/utilisateurs/${referee.id}`} className="self-start text-sm font-bold text-link underline underline-offset-4">
              {t("playerFile")}
            </Link>
          </section>

          <section className="flex flex-col gap-3 lacquer rounded-card p-4" aria-labelledby="parrain">
            <h3 id="parrain" className="font-title text-lg font-bold">{t("referrerTitle", { name: referrer.name })}</h3>
            {facts([
              [t("installed"), format.number(referrer.installed)],
              [t("milestones"), referrer.milestones.length ? referrer.milestones.join(", ") : t("none")],
              [
                t("received"),
                referrer.received.zeni + referrer.received.boosters + referrer.received.vouchers > 0
                  ? t("receivedValue", { zeni: referrer.received.zeni, boosters: referrer.received.boosters, vouchers: referrer.received.vouchers })
                  : t("nothingYet"),
              ],
              ...(referrer.ambassador ? ([[t("role"), t("ambassador")]] as [string, ReactNode][]) : []),
              ...(referrer.banned ? ([[t("state"), <b key="ban" className="text-shu">{t("banned")}</b>]] as [string, ReactNode][]) : []),
            ])}
            <Link href={`/admin/utilisateurs/${referrer.id}`} className="self-start text-sm font-bold text-link underline underline-offset-4">
              {t("playerFile")}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
