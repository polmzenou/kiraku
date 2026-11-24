import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ReasonChips, ScoreBadge } from "@/components/admin/MultiAccount";
import { AmbassadorActions } from "@/components/admin/referral/AmbassadorActions";
import { ReferralAdminTabs } from "@/components/admin/referral/ReferralAdminTabs";
import { ReviewActions } from "@/components/admin/referral/ReviewActions";
import { LotGifts } from "@/components/referral/LotGifts";
import { Link } from "@/i18n/navigation";
import { canManageReferrals } from "@/lib/admin/roles";
import { requireAdminView } from "@/server/admin";
import { ambassadorProposals, referralQueue } from "@/server/referral/admin-queries";
import { referralV2Rules } from "@/server/referral/deps";
import { getSetting } from "@/server/settings";

/**
 * Parrainage v2, file « À vérifier » (design « cartes » de l'atelier équipe) : chaque parrainage bloqué, ses indices et
 * ce qui attend la décision ; rien n'est versé tant qu'il est ici. Toute l'équipe décide (canManageReferrals) : valider
 * verse tout ce qui était dû, révoquer arrête les versements, révoquer et bannir reprend tout et bannit les deux comptes.
 */
export default async function AdminReferralQueuePage() {
  const { user } = await requireAdminView();
  const now = new Date();
  const [t, tAmb, format, locale, rules, enabled, proposals] = await Promise.all([
    getTranslations("admin.referralV2.queue"),
    getTranslations("admin.referralV2.ambassador"),
    getFormatter(),
    getLocale(),
    referralV2Rules(),
    getSetting("referral.v2.enabled"),
    ambassadorProposals(),
  ]);
  const { items, members } = await referralQueue(rules, locale);
  const ambassadorAt = rules.milestones.find((m) => m.ambassador)?.installed ?? null;
  const canManage = canManageReferrals(user.role);

  return (
    <div className="flex flex-col gap-6">
      <ReferralAdminTabs active="queue" held={items.length + proposals.length} />
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      {!enabled && (
        <p role="note" className="rounded-card border border-ai/40 bg-ai/10 px-4 py-3 text-sm">
          {t("off")}
        </p>
      )}

      {proposals.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="ambassadeurs">
          <div className="flex flex-col gap-1">
            <h3 id="ambassadeurs" className="font-title text-lg font-bold">{tAmb("title", { count: proposals.length })}</h3>
            <p className="max-w-prose text-sm text-text-muted">{ambassadorAt ? tAmb("intro", { count: ambassadorAt }) : tAmb("introNoRung")}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 lacquer rounded-card border-hisui/50 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span aria-hidden="true" lang="ja" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-hisui font-seal text-lg text-bg">使</span>
                  <Link href={`/admin/utilisateurs/${p.user.id}`} className="text-base font-bold text-link underline-offset-4 hover:underline">
                    {p.user.name}
                  </Link>
                  {p.user.ambassador && <span className="rounded-pill border border-hisui/60 px-2.5 py-0.5 text-xs font-bold text-hisui">{tAmb("already")}</span>}
                  {p.user.banned && <span className="rounded-pill border border-shu/60 px-2.5 py-0.5 text-xs font-bold text-shu">{tAmb("banned")}</span>}
                </div>
                <p className="text-xs text-text-muted">
                  {tAmb("installed", { then: p.installed.then, now: p.installed.now })} · {tAmb("since", { time: format.relativeTime(new Date(p.createdAt), now) })}
                </p>
                {canManage && <AmbassadorActions proposalId={p.id} name={p.user.name} banned={p.user.banned} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length === 0 ? (
        <p className="lacquer rounded-card p-6 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const pending = [
              { name: item.referrer.name, lot: item.pending.referrer },
              { name: item.referee.name, lot: item.pending.referee },
            ].filter((p) => p.lot !== null);
            return (
              <li key={item.id} className="flex flex-col gap-3 lacquer rounded-card p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="min-w-0 text-base">
                    <b>{item.referee.name}</b> <span aria-hidden="true" className="text-text-muted">→</span>
                    <span className="sr-only"> {t("referredBy")} </span> <b>{item.referrer.name}</b>
                  </p>
                  {item.score !== null && <ScoreBadge score={item.score} label={t("score", { score: item.score })} />}
                  <span className="text-xs text-text-muted">
                    {t("steps", { count: item.stepsDone })} · {t("since", { time: format.relativeTime(new Date(item.heldAt), now) })}
                  </span>
                </div>

                <ul className="flex flex-wrap gap-2 text-xs">
                  {item.device && (
                    <li className="inline-flex items-center rounded-pill border border-shu/60 bg-shu/10 px-3 py-1 font-bold text-shu">
                      {item.device.withReferrer ? t("deviceReferrer") : t("deviceSiblings", { names: item.device.siblings.join(", ") })}
                    </li>
                  )}
                  {item.holdReason === "SCORE" && item.score !== null && (
                    <li className="inline-flex items-center rounded-pill border border-shu/60 bg-shu/10 px-3 py-1 font-bold text-shu">
                      {t("scoreOver", { score: item.score, threshold: rules.holdScore })}
                    </li>
                  )}
                </ul>
                {item.reasons.length > 0 && (
                  <ReasonChips reasons={item.reasons} members={members} masked pair={{ a: item.referee.id, b: item.referrer.id }} />
                )}

                <div className="flex flex-col gap-1.5">
                  {pending.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("pendingNone")}</p>
                  ) : (
                    pending.map((p) => (
                      <div key={p.name} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-text-muted">{t("pendingFor", { name: p.name })}</span>
                        <LotGifts lot={p.lot} compact />
                      </div>
                    ))
                  )}
                </div>

                {canManage && <ReviewActions referralId={item.id} state="HELD" ficheHref={`/admin/parrainage/suivi/${item.id}`} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
