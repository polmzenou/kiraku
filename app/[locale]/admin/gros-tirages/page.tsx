import { getLocale, getTranslations } from "next-intl/server";
import { PullFeedModeration } from "@/components/admin/PullFeedModeration";
import { PullFeedSettingsForm } from "@/components/admin/PullFeedSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { PULL_FEED_SETTING_KEYS, type PullFeedSettings } from "@/lib/settings/pull-feed-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getPullFeedBlocklist, getPullFeedPreview } from "@/server/admin/pull-feed";
import { getSetting } from "@/server/settings";

/** Carrousel « En direct · Gros tirages » : réglages, max d'apparitions par joueur, blacklist et fil actuel. */
export default async function AdminPullFeedPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [t, values, logs, blocked, preview] = await Promise.all([
    getTranslations("admin.pullFeed"),
    Promise.all(PULL_FEED_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["home.pullFeed."]),
    getPullFeedBlocklist(),
    getPullFeedPreview(locale),
  ]);
  const settings = Object.fromEntries(PULL_FEED_SETTING_KEYS.map((k, i) => [k, values[i]])) as PullFeedSettings;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      <PullFeedSettingsForm initial={settings} />
      <PullFeedModeration blocked={blocked} preview={preview} />
      <SettingLogList logs={logs} />
    </div>
  );
}
