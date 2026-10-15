import { getFormatter, getTranslations } from "next-intl/server";
import { RevokeReferralButton } from "@/components/admin/RevokeReferralButton";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { topReferrers } from "@/server/economy/admin-queries";

/** Parrainages récents : repérer les grappes de filleuls d'un même parrain, révoquer en cas de fraude. */
export default async function AdminReferralPage() {
  await requireAdmin();
  const [t, format] = await Promise.all([getTranslations("admin.economy"), getFormatter()]);
  const [referrals, top] = await Promise.all([
    prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        referrerClaimedAt: true,
        refereeClaimedAt: true,
        referrer: { select: { username: true } },
        referee: { select: { username: true } },
      },
    }),
    topReferrers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("referralTitle")}</h2>
        <p className="max-w-prose text-sm text-text-muted">
          {t("referralIntro")}{" "}
          <Link href="/admin/economie" className="text-link underline underline-offset-4">
            {t("referralSettingsLink")}
          </Link>
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-title text-lg font-bold">{t("topReferrers")}</h3>
        {top.length === 0 ? (
          <p className="text-sm text-text-muted">{t("referralsEmpty")}</p>
        ) : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {top.map((r) => (
              <li key={r.referrerId} className="flex justify-between rounded-button border border-border bg-surface p-2">
                <span>{r.username}</span>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-title text-lg font-bold">{t("recentReferrals")}</h3>
        {referrals.length === 0 ? (
          <p className="text-sm text-text-muted">{t("referralsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {referrals.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <span className="font-bold">{t("referralLine", { referrer: r.referrer.username, referee: r.referee.username })}</span>
                  <span className="text-xs text-text-muted">
                    {t(`referralStatus.${r.status}`)} · {format.dateTime(r.createdAt, { dateStyle: "short" })}
                    {r.referrerClaimedAt && ` · ${t("referrerClaimed")}`}
                    {r.refereeClaimedAt && ` · ${t("refereeClaimed")}`}
                  </span>
                </div>
                {r.status !== "REVOKED" && <RevokeReferralButton referralId={r.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
