import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { NewsSettingsForm } from "@/components/admin/NewsSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { prisma } from "@/server/db";
import { resolveNewsVisuals } from "@/server/home/news";
import { getSetting } from "@/server/settings";

/** Nouveautés : le carrousel en haut de l'accueil (bannières, visuels, boutons), en français et en anglais. */
export default async function AdminNewsPage() {
  await requireAdmin();
  const [t, format, locale, news, logs, types] = await Promise.all([
    getTranslations("admin.news"),
    getFormatter(),
    getLocale(),
    getSetting("home.news"),
    recentSettingLogs(["home.news"]),
    prisma.boosterType.findMany({ select: { slug: true, name: true, active: true }, orderBy: [{ active: "desc" }, { slug: "asc" }] }),
  ]);
  // Visuels de départ de l'aperçu, en français (sa langue par défaut)
  const visuals = await resolveNewsVisuals(news.items, "fr");
  const boosters = types.map((b) => ({ slug: b.slug, name: localize(parseLocalized(b.name, b.slug), locale), active: b.active }));

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
      <NewsSettingsForm initial={{ "home.news": news }} boosters={boosters} initialVisuals={visuals} />
      <SettingLogList logs={logs} />
    </div>
  );
}
