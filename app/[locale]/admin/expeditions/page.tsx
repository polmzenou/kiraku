import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DeleteExpeditionTypeButton, RecallExpeditionButton, SeedExpeditionsButton } from "@/components/admin/ExpeditionAdminActions";
import { ExpeditionSettingsForm } from "@/components/admin/ExpeditionSettingsForm";
import { ExpeditionTypeForm } from "@/components/admin/ExpeditionTypeForm";
import { ReadOnly } from "@/components/admin/ReadOnly";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Link } from "@/i18n/navigation";
import { balanceFor } from "@/lib/expedition/balance";
import { headroom, tierOf } from "@/lib/expedition/tiers";
import { EXPEDITION_SETTING_KEYS, type ExpeditionSettings } from "@/lib/settings/expedition-form";
import { recentSettingLogs, requireAdminView } from "@/server/admin";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { lotOptions } from "@/server/economy/admin-queries";
import { activeExpeditions, adminExpeditionTypes, boosterTypeOptions, expeditionStats } from "@/server/expedition/admin-queries";
import { getSetting } from "@/server/settings";

/** Expéditions : interrupteur et réglages, modèles par palier avec l'aperçu d'équilibrage, expéditions en route. */
export default async function AdminExpeditionsPage({ searchParams }: PageProps<"/[locale]/admin/expeditions">) {
  const { readOnly } = await requireAdminView();
  const [t, tRisk, tRarity, format, locale, sp, values, logs, definitions] = await Promise.all([
    getTranslations("admin.expeditions"),
    getTranslations("expedition.risk"),
    getTranslations("rarity"),
    getFormatter(),
    getLocale(),
    searchParams,
    Promise.all(EXPEDITION_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["expedition."]),
    getRarityDefinitions(),
  ]);
  const settings = Object.fromEntries(EXPEDITION_SETTING_KEYS.map((k, i) => [k, values[i]])) as ExpeditionSettings;
  const [types, boosters, lots, active, stats] = await Promise.all([
    adminExpeditionTypes(),
    boosterTypeOptions(locale),
    lotOptions(locale),
    activeExpeditions(locale),
    expeditionStats(),
  ]);
  const editId = typeof sp.id === "string" ? sp.id : null;
  const editing = editId ? types.find((x) => x.input.id === editId) : undefined;
  const rules = {
    cardBonus: settings["expedition.cardBonus"],
    triumphRewardPct: settings["expedition.triumphRewardPct"],
    failRewardPct: settings["expedition.failRewardPct"],
  };
  const boosterName = new Map(boosters.map((b) => [b.id, b.name]));
  const lotName = new Map(lots.map((l) => [l.id, l.name]));
  // Modèles groupés par palier de rareté, du plus courant au plus rare
  const byTier = [...types].sort(
    (a, b) => (tierOf(a.input.minRarity, definitions) ?? 0) - (tierOf(b.input.minRarity, definitions) ?? 0) || a.input.sortOrder - b.input.sortOrder,
  );
  const enabled = settings["expedition.enabled"];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm font-bold tabular-nums" role="status">
          {t(enabled ? "statusOn" : "statusOff")}
        </p>
        <Link href="/expedition" prefetch={false} className="inline-flex min-h-11 items-center self-start text-sm text-link underline">
          {t(enabled ? "openPage" : "previewPage")}
        </Link>
      </div>

      <ReadOnly when={readOnly}>
        <ExpeditionSettingsForm initial={settings} />
      </ReadOnly>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-xl font-bold">{t("statsTitle")}</h3>
        <p className="text-sm tabular-nums text-text-muted">
          {t("stats", {
            active: format.number(stats.active),
            completed: format.number(stats.completed),
            abandoned: format.number(stats.abandoned),
            triumph: format.number(stats.triumph),
            success: format.number(stats.success),
            failure: format.number(stats.failure),
            rate: stats.successRate ?? 0,
            zeni: format.number(stats.zeni),
          })}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-title text-xl font-bold">{t("typesTitle", { count: types.length })}</h3>
          {!readOnly && <SeedExpeditionsButton />}
        </div>
        <p className="max-w-prose text-sm text-text-muted">{t("typesHint")}</p>
        {boosters.length === 0 ? (
          <p className="text-sm text-text-muted">{t("needBooster")}</p>
        ) : (
          <ReadOnly when={readOnly}>
            <ExpeditionTypeForm key={editId ?? "new"} initial={editing?.input ?? null} boosters={boosters} lots={lots} rules={rules} />
          </ReadOnly>
        )}
        <ul className="flex flex-col gap-2">
          {byTier.map(({ input: x, played }) => {
            const estimate = balanceFor(x, rules, rules.cardBonus, headroom(x.minRarity, definitions));
            return (
              <li key={x.id} className="flex flex-col gap-2 lacquer rounded-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-bold">
                    <span className="mr-2 text-xs text-text-muted">{tRarity(x.minRarity as "COMMON")}</span>
                    <span className="mr-2 text-xs text-text-muted">{tRisk(x.risk)}</span>
                    {x.name.fr}
                    {!x.active && <span className="ml-2 text-xs text-text-muted">{t("inactive")}</span>}
                  </p>
                  <p className="text-xs tabular-nums text-text-muted">
                    {t("typeMeta", {
                      hours: format.number(x.durationMinutes / 60, { maximumFractionDigits: 1 }),
                      base: x.baseSuccessPct,
                      max: x.maxSuccessPct,
                      zeni: format.number(x.zeni),
                      boosters: x.boosters,
                      booster: boosterName.get(x.boosterTypeId) ?? "?",
                      discovery: x.minDiscoveryPct,
                      weight: x.weight,
                      played: format.number(played),
                    })}
                    {x.extraLotId && ` · ${t("typeLot", { lot: lotName.get(x.extraLotId) ?? "?" })}`}
                  </p>
                  <p className="text-xs tabular-nums text-text-muted">
                    {t("typeBalance", {
                      min: estimate.minimal.success,
                      max: estimate.ideal.success,
                      triumph: estimate.ideal.triumph,
                      zeni: format.number(estimate.minimal.zeni),
                      perHour: format.number(estimate.minimal.zeniPerHour),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={{ pathname: "/admin/expeditions", query: { id: x.id } }} className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4">
                    {t("edit")}
                  </Link>
                  {!readOnly && played === 0 && x.id && <DeleteExpeditionTypeButton id={x.id} name={x.name.fr} />}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-xl font-bold">{t("activeTitle", { count: active.length })}</h3>
        {active.length === 0 ? (
          <p className="text-sm text-text-muted">{t("activeEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 lacquer rounded-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <span className="font-bold">{a.username}</span> · {a.name}
                  <span className="block text-xs tabular-nums text-text-muted">
                    {t("activeMeta", {
                      started: format.dateTime(a.startedAt, { dateStyle: "short", timeStyle: "short" }),
                      ends: format.dateTime(a.endsAt, { dateStyle: "short", timeStyle: "short" }),
                      chance: format.number(a.successPct, { maximumFractionDigits: 1 }),
                    })}
                  </span>
                </p>
                {!readOnly && <RecallExpeditionButton id={a.id} username={a.username} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SettingLogList logs={logs} />
    </div>
  );
}
