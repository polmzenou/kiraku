import { getFormatter, getTranslations } from "next-intl/server";
import { NewsSettingsForm } from "@/components/admin/NewsSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getSetting } from "@/server/settings";

/** Nouveautés : l'encart en haut de l'accueil (titre, nouveautés et boutons), en français et en anglais. */
export default async function AdminNewsPage() {
  await requireAdmin();
  const [t, format, news, logs] = await Promise.all([
    getTranslations("admin.news"),
    getFormatter(),
    getSetting("home.news"),
    recentSettingLogs(["home.news"]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums">
          {news.publishedAt
            ? t("revision", { revision: news.revision, date: format.dateTime(new Date(news.publishedAt), { dateStyle: "long", timeZone: "Europe/Paris" }) })
            : t("revisionNever", { revision: news.revision })}
        </p>
      </div>
      <NewsSettingsForm initial={{ "home.news": news }} />
      <SettingLogList logs={logs} />
    </div>
  );
}
