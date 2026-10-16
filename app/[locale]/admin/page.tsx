import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/server/admin";
import { adminDashboard } from "@/server/admin/dashboard";
import { getSetting } from "@/server/settings";

type Tile = { label: string; value: string; hint?: string; href?: string; alert?: boolean };

/** Tableau de bord : activité des dernières 24 h, économie, marché, combats, points d'attention. */
export default async function AdminHome() {
  await requireAdmin();
  const [t, format, d, termsVersion] = await Promise.all([
    getTranslations("admin.dashboard"),
    getFormatter(),
    adminDashboard(),
    getSetting("legal.termsRequiredVersion"),
  ]);
  const n = (v: number) => format.number(v);

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: t("players"),
      tiles: [
        { label: t("active24h"), value: n(d.players.active24h) },
        { label: t("signups24h"), value: n(d.players.signups24h), hint: t("guests24h", { count: d.players.guests24h }) },
        { label: t("boosters24h"), value: n(d.players.boosters24h) },
        { label: t("totalPlayers"), value: n(d.economy.players), href: "/admin/utilisateurs" },
      ],
    },
    {
      title: t("economy"),
      tiles: [
        { label: t("circulating"), value: t("zeni", { amount: d.economy.circulating }), href: "/admin/economie" },
        {
          label: t("ledger"),
          value: d.ledgerOk && d.economy.ledger === d.economy.circulating ? t("ledgerOk") : t("ledgerKo"),
          alert: !d.ledgerOk || d.economy.ledger !== d.economy.circulating,
          href: "/admin/economie",
        },
        { label: t("escrow"), value: t("zeni", { amount: d.market.escrow }), hint: t("activeAuctions", { count: d.market.active }) },
      ],
    },
    {
      title: t("today"),
      tiles: [
        { label: t("sales24h"), value: n(d.market.sold24h), hint: t("volume", { amount: d.market.volume24h }), href: "/admin/marche" },
        { label: t("battles24h"), value: n(d.combat.finished24h), hint: t("bots", { count: d.combat.bots24h }), href: "/admin/combat" },
        { label: t("liveBattles"), value: n(d.combat.active), hint: t("queued", { count: d.combat.queued }) },
      ],
    },
    {
      title: t("attention"),
      tiles: [
        { label: t("pendingDeletions"), value: n(d.pendingDeletions), href: "/admin/donnees", alert: d.pendingDeletions > 0 },
        { label: t("banned"), value: n(d.banned), href: "/admin/utilisateurs?filter=banned" },
        { label: t("termsVersion"), value: `v${termsVersion}`, href: "/admin/legal" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-title text-2xl font-bold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-text-muted">{t("intro")}</p>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-text-muted">{g.title}</h3>
          <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {g.tiles.map((tile) => (
              <div
                key={tile.label}
                className={`relative flex min-h-20 flex-col gap-0.5 rounded-lg border bg-surface p-3 ${tile.alert ? "border-shu" : "border-border"}`}
              >
                <dt className="text-xs text-text-muted">{tile.label}</dt>
                <dd className={`text-lg font-bold tabular-nums ${tile.alert ? "text-shu" : ""}`}>{tile.value}</dd>
                {tile.hint && <dd className="text-xs text-text-muted">{tile.hint}</dd>}
                {/* Toute la case mène au module concerné */}
                {tile.href && <Link href={tile.href} aria-label={tile.label} className="absolute inset-0 rounded-lg" />}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
