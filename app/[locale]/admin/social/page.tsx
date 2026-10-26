import { getFormatter, getTranslations } from "next-intl/server";
import { SocialSettingsForm } from "@/components/admin/SocialSettingsForm";
import { SOCIAL_SETTING_KEYS, type SocialSettings } from "@/lib/settings/social-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getSetting } from "@/server/settings";
import { recentGifts } from "@/server/social/queries";

export default async function AdminSocialPage() {
  await requireAdmin();
  const [t, format, values, logs, gifts] = await Promise.all([
    getTranslations("admin.social"),
    getFormatter(),
    Promise.all(SOCIAL_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["social.", "friends.", "gifts.", "notifications."]),
    recentGifts(),
  ]);
  const settings = Object.fromEntries(SOCIAL_SETTING_KEYS.map((k, i) => [k, values[i]])) as SocialSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>

      <SocialSettingsForm initial={settings} />

      {/* Journal des cadeaux : repérer un compte principal alimenté par des comptes secondaires */}
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-bold">{t("giftLog")}</h2>
        {gifts.length === 0 ? (
          <p className="text-sm text-text-muted">{t("giftLogEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gifts.map((g) => (
              <li key={g.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-control border border-border bg-surface p-3 text-sm">
                <span>
                  {t(g.kind === "CARD" ? "giftCard" : g.kind === "SEALED" ? "giftSealed" : "giftBooster", {
                    from: g.sender.username,
                    to: g.recipient.username,
                    zeni: g.zeniSpent,
                  })}
                </span>
                <time dateTime={g.createdAt.toISOString()} className="text-xs text-text-muted">
                  {format.dateTime(g.createdAt, { dateStyle: "short", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-bold">{t("log")}</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-text-muted">{t("logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 rounded-control border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{t("logEntry", { key: log.targetId ?? "", admin: log.admin.username })}</span>
                  <time dateTime={log.createdAt.toISOString()} className="text-xs text-text-muted">
                    {format.dateTime(log.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </div>
                <p className="break-all text-xs text-text-muted">
                  {JSON.stringify(log.before)} → {JSON.stringify(log.after)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
