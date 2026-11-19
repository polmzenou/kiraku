import { getFormatter, getTranslations } from "next-intl/server";
import { InstallPrestigeCosmetics } from "@/components/admin/InstallPrestigeCosmetics";
import { PrestigeSettingsForm } from "@/components/admin/PrestigeSettingsForm";
import { SettingLogList } from "@/components/admin/SettingLogList";
import { Link } from "@/i18n/navigation";
import { sealOf } from "@/lib/prestige/printing";
import { PRESTIGE_SETTING_KEYS, type PrestigeSettings } from "@/lib/settings/prestige-form";
import { recentSettingLogs, requireAdmin } from "@/server/admin";
import { getCatalogStats } from "@/server/catalog/queries";
import { getRarityDefinitions } from "@/server/catalog/rarities";
import { printingOverview, prestigeBalance, recentRebirths } from "@/server/prestige/admin-queries";
import { getSetting } from "@/server/settings";

/** Prestige : interrupteur et réglages, aperçu d'équilibrage (seuils, joueurs éligibles), dernières renaissances. */
export default async function AdminPrestigePage() {
  await requireAdmin();
  const [t, format, tRarity, values, logs, definitions, catalog, rebirths, printings] = await Promise.all([
    getTranslations("admin.prestige"),
    getFormatter(),
    getTranslations("rarity"),
    Promise.all(PRESTIGE_SETTING_KEYS.map((k) => getSetting(k))),
    recentSettingLogs(["prestige."]),
    getRarityDefinitions(),
    getCatalogStats(),
    recentRebirths(),
    printingOverview(),
  ]);
  const settings = Object.fromEntries(PRESTIGE_SETTING_KEYS.map((k, i) => [k, values[i]])) as PrestigeSettings;
  const nameOf = (key: string) => (tRarity.has(key as "COMMON") ? tRarity(key as "COMMON") : key);
  const balance = await prestigeBalance({
    order: definitions.map((d) => d.key),
    published: catalog.byRarity,
    percent: settings["prestige.requiredPercent"],
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl">{t("title")}</h1>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
        <p className="text-sm">
          {settings["prestige.enabled"] ? t("statusOn") : t("statusOff")}{" "}
          <Link href="/prestige" className="text-link underline underline-offset-4">
            {t("openPage")}
          </Link>
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-bold">{t("balance.title")}</h2>
        <p className="text-sm text-text-muted">{t("balance.summary", { eligible: balance.eligible, near: balance.near })}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="text-left text-text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">{t("balance.rarity")}</th>
                <th className="py-1 pr-3 font-normal tabular-nums">{t("balance.published")}</th>
                <th className="py-1 pr-3 font-normal tabular-nums">{t("balance.required")}</th>
                <th className="py-1 font-normal tabular-nums">{t("balance.players")}</th>
              </tr>
            </thead>
            <tbody>
              {balance.rows.map((r) => (
                <tr key={r.rarity} className="border-t border-border">
                  <td className="py-1.5 pr-3">{nameOf(r.rarity)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{format.number(r.published)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{t("balance.requiredValue", { count: r.required, pct: r.pct })}</td>
                  <td className="py-1.5 tabular-nums">{format.number(r.players)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {balance.unset.length > 0 && <p className="text-sm text-shu">{t("balance.unset", { rarities: balance.unset.map(nameOf).join(", ") })}</p>}
        {balance.closest.length > 0 && (
          <p className="text-sm text-text-muted">
            {t("balance.closest")} {balance.closest.map((c) => `${c.username} (${format.number(Math.min(1, c.progress), { style: "percent" })})`).join(" · ")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-bold">{t("printings.title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("printings.hint")}</p>
        {printings.length === 0 ? (
          <p className="text-sm text-text-muted">{t("printings.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {printings.map((p) => {
              const seal = sealOf(p.printing, settings["prestige.printing.seals"]);
              return (
                <li key={p.printing} className="flex flex-wrap items-baseline gap-x-3 border-t border-border py-1.5">
                  {seal && (
                    <span lang="ja" className="font-seal text-shu">
                      {seal}
                    </span>
                  )}
                  <b>{t("printings.name", { printing: p.printing })}</b>
                  {p.printing === settings["prestige.printing.current"] && <span className="text-xs font-bold text-kin">{t("printings.current")}</span>}
                  <span className="text-text-muted">{t("printings.row", { cards: p.cards, issued: p.issued, capacity: p.capacity, alive: p.alive })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PrestigeSettingsForm initial={settings} />

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-bold">{t("cosmetics.title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("cosmetics.intro")}</p>
        <InstallPrestigeCosmetics />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-title text-lg font-bold">{t("rebirths.title")}</h2>
        {rebirths.length === 0 ? (
          <p className="text-sm text-text-muted">{t("rebirths.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {rebirths.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-border py-1.5">
                <b>#{r.globalRank}</b>
                <span>{r.user.username}</span>
                <span className="text-text-muted">{t("rebirths.row", { number: r.number, cards: r.uniqueCards, zeni: r.zeni })}</span>
                <span className="text-text-muted">{format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SettingLogList logs={logs} />
    </div>
  );
}
