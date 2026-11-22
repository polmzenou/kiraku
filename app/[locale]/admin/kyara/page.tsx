import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { KyaraBookmarklet } from "@/components/admin/kyara/KyaraBookmarklet";
import { KyaraProcessButton } from "@/components/admin/kyara/KyaraProcessButton";
import { KyaraImportSettingsForm } from "@/components/admin/KyaraImportSettingsForm";
import { ReadOnly } from "@/components/admin/ReadOnly";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Link } from "@/i18n/navigation";
import { canProcessKyaraImports } from "@/lib/admin/roles";
import { bookmarkletHref, bookmarkletSource, BOOKMARKLET_BUILD } from "@/lib/kyara/bookmarklet";
import { kyaraProfileUrl } from "@/lib/kyara/profile-url";
import { KYARA_FORM_KEYS, type KyaraSettings } from "@/lib/settings/kyara-form";
import { recentSettingLogs, requireAdminView } from "@/server/admin";
import { appUrl } from "@/server/env";
import { getKyaraRules, kyaraAdminOverview, kyaraQueue, QUEUE_TABS, type QueueTab } from "@/server/kyara/queries";
import { getSetting } from "@/server/settings";

/**
 * Import Kyara (étape 17) : état de la sortie, file des demandes (toute l'équipe la traite), favori à installer et
 * réglages (admin seul ; lecture seule pour le DEV).
 */
export default async function AdminKyaraPage({ searchParams }: PageProps<"/[locale]/admin/kyara">) {
  const { user, readOnly } = await requireAdminView();
  const now = new Date().getTime();
  const sp = await searchParams;
  const raw = Array.isArray(sp.onglet) ? sp.onglet[0] : sp.onglet;
  const tab: QueueTab = (QUEUE_TABS as readonly string[]).includes(raw ?? "") ? (raw as QueueTab) : "PENDING";
  const [t, tBookmarklet, format, locale, values, rules, overview, logs, queue] = await Promise.all([
    getTranslations("admin.kyara"),
    getTranslations("admin.kyara.bookmarklet.texts"),
    getFormatter(),
    getLocale(),
    Promise.all(KYARA_FORM_KEYS.map((k) => getSetting(k))),
    getKyaraRules(),
    kyaraAdminOverview(),
    recentSettingLogs(["kyaraImport."]),
    kyaraQueue(tab),
  ]);
  const canProcess = canProcessKyaraImports(user.role);
  const receiveUrl = `${appUrl()}${locale === "fr" ? "" : `/${locale}`}/admin/kyara/recevoir`;
  // Textes bruts : « {n} » et « {e} » sont remplis par le favori lui-même, sur kyara.games
  const template = (key: "wrongPage" | "noToken" | "reading" | "hidden" | "failed" | "copy") => String(tBookmarklet.raw(key));
  const texts = {
    wrongPage: template("wrongPage"),
    noToken: template("noToken"),
    reading: template("reading"),
    hidden: template("hidden"),
    failed: template("failed"),
    copy: template("copy"),
  };
  const settings = Object.fromEntries(KYARA_FORM_KEYS.map((k, i) => [k, values[i]])) as KyaraSettings;
  const configured = rules.launchAt !== null && rules.staffKyaraUserId !== null;
  const status = !rules.enabled ? "off" : !configured ? "unconfigured" : now < rules.launchAt! ? "scheduled" : "open";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold" role="status">
          {t(`status.${status}`, { date: rules.launchAt !== null ? format.dateTime(new Date(rules.launchAt), { dateStyle: "full", timeStyle: "short" }) : "" })}
        </p>
        {rules.enabled && !configured && (
          <p role="alert" className="text-sm font-bold text-shu">
            {t("unconfiguredHelp")}
          </p>
        )}
        <Link href="/compte/import-kyara" className="w-fit text-sm text-link underline underline-offset-4">
          {t("preview")}
        </Link>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="kyara-queue-stats">
        <h3 id="kyara-queue-stats" className="font-title text-lg font-bold">
          {t("stats.title")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(
            [
              ["pending", overview.pending],
              ["ready", overview.ready],
              ["done", overview.done],
              ["rejected", overview.rejected],
              ["cancelled", overview.cancelled],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="lacquer rounded-card p-4">
              <dt className="text-sm text-text-muted">{t(`stats.${key}`)}</dt>
              <dd className="font-heading text-2xl tabular-nums">{format.number(value)}</dd>
            </div>
          ))}
        </dl>
        {overview.oldestPendingAt && (
          <p className="text-sm text-text-muted">{t("stats.oldest", { date: format.relativeTime(overview.oldestPendingAt, now) })}</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="kyara-queue">
        <h3 id="kyara-queue" className="font-title text-lg font-bold">
          {t("queue.title")}
        </h3>
        <nav aria-label={t("queue.tabs")} className="flex gap-1 overflow-x-auto border-b border-border">
          {QUEUE_TABS.map((key) => (
            <Link
              key={key}
              href={{ pathname: "/admin/kyara", query: { onglet: key } }}
              aria-current={tab === key ? "page" : undefined}
              className={`flex min-h-11 items-center border-b-[3px] px-3 text-sm font-bold whitespace-nowrap ${tab === key ? "border-shu text-text" : "border-transparent text-text-muted hover:text-text"}`}
            >
              {t(`queue.tab.${key}`)}
            </Link>
          ))}
        </nav>
        {queue.length === 0 ? (
          <p className="text-sm text-text-muted">{t("queue.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {queue.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 rounded-control border border-border bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-bold">
                    {row.user ? (
                      <Link href={`/admin/utilisateurs/${row.user.id}`} className="underline underline-offset-4">
                        {row.user.username}
                      </Link>
                    ) : (
                      t("queue.deletedPlayer")
                    )}
                  </span>
                  <span className="text-xs text-text-muted">
                    {t("queue.requested", { date: format.relativeTime(row.requestedAt, now) })}
                    {row.user && ` · ${t("queue.accountAge", { date: format.relativeTime(row.user.createdAt, now) })}`}
                    {row.snapshotCards !== null && ` · ${t("queue.cards", { count: row.snapshotCards })}`}
                    {row.discordVerified === false && ` · ${t("queue.noDiscordId")}`}
                    {row.grantedCards !== null && ` · ${t("queue.granted", { cards: row.grantedCards, zeni: row.grantedZeni ?? 0 })}`}
                    {row.rejectCode && ` · ${t(`rejectCodes.${row.rejectCode as "OTHER"}`)}`}
                  </span>
                  <a href={kyaraProfileUrl(row.kyaraUserId)} target="_blank" rel="noopener noreferrer" className="w-fit text-xs text-ai underline underline-offset-4">
                    {t("queue.kyaraProfile")}
                  </a>
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2">
                  {tab === "PENDING" && canProcess && row.user?.id !== user.id && <KyaraProcessButton importId={row.id} />}
                  <Link href={`/admin/kyara/${row.id}`} className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4">
                    {t("queue.open")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canProcess && (
        <KyaraBookmarklet
          href={bookmarkletHref(bookmarkletSource({ receiveUrl, texts, mode: "navigate" }))}
          console={bookmarkletSource({ receiveUrl, texts, mode: "print" })}
          build={BOOKMARKLET_BUILD}
        />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="kyara-settings">
        <h3 id="kyara-settings" className="font-title text-lg font-bold">
          {t("settings.title")}
        </h3>
        {readOnly && <p className="text-sm text-text-muted">{t("settings.readOnly")}</p>}
        <ReadOnly when={readOnly}>
          <KyaraImportSettingsForm initial={settings} />
        </ReadOnly>
      </section>
      <SettingLogList logs={logs} />
    </div>
  );
}
