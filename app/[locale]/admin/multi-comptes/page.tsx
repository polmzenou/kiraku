import { getFormatter, getTranslations } from "next-intl/server";
import { GroupBanButton } from "@/components/admin/GroupBanButton";
import { MemberTable, PairList, ScoreBadge } from "@/components/admin/MultiAccount";
import { ResponsiveTable } from "@/components/admin/ResponsiveTable";
import { Button } from "@/components/ui/Button";
import { inputClass, selectClass } from "@/components/ui/Field";
import { Link } from "@/i18n/navigation";
import { maskIp } from "@/lib/anticheat/mask";
import { GROUP_BAN_MAX, ipBanKey } from "@/lib/anticheat/network";
import { z } from "@/lib/zod";
import { requireAdminView } from "@/server/admin";
import { bannedIpKeys, countNetworkBans } from "@/server/anticheat/network-ban-queries";
import { sharedIps, suspectClusters } from "@/server/anticheat/queries";
import { getSetting } from "@/server/settings";

const FILTERS = ["all", "device", "ip", "flow"] as const;
const SHOWN = 50;

const paramsSchema = z.object({
  q: z.string().trim().max(40).catch(""),
  filter: z.enum(FILTERS).catch("all"),
  guests: z.literal("1").optional().catch(undefined),
  // Recherche par IP (admin seulement) : chiffres, points, deux-points et hexadécimal, rien qui touche au LIKE
  ip: z.string().trim().regex(/^[0-9a-fA-F:.]{3,64}$/).optional().catch(undefined),
});

/**
 * Détection des multi-comptes : groupes de comptes reliés par des indices (appareil, IP, e-mails, transferts,
 * parrainage, ami unique). Ouverte au DEV en lecture, IP et e-mails masqués. L'ADMIN bannit ici un groupe entier
 * (comptes, IP et appareils) ; un ban précis se fait depuis la fiche du joueur.
 */
export default async function AdminMultiAccountsPage({ searchParams }: PageProps<"/[locale]/admin/multi-comptes">) {
  const { readOnly: masked } = await requireAdminView();
  const raw = await searchParams;
  const params = paramsSchema.parse({ q: raw.q ?? "", filter: raw.filter ?? "all", guests: raw.guests, ip: raw.ip });
  const ipSearch = masked ? undefined : params.ip;
  const [t, nb, users, format, detection, ips, cap, banCount, bannedIps] = await Promise.all([
    getTranslations("admin.multiAccounts"),
    getTranslations("admin.networkBans"),
    getTranslations("admin.users"),
    getFormatter(),
    suspectClusters({ includeGuests: params.guests === "1" }),
    sharedIps({ prefix: ipSearch, take: ipSearch ? 50 : 20 }),
    getSetting("multiAccount.sharedIpCap"),
    countNetworkBans(),
    bannedIpKeys(),
  ]);
  const { members, minScore } = detection;
  const query = params.q.toLowerCase();
  const clusters = detection.clusters.filter((c) => {
    if (query && !c.userIds.some((id) => members.get(id)?.username.toLowerCase().includes(query))) return false;
    if (params.filter === "all") return true;
    const kind = params.filter === "device" ? "device" : params.filter === "ip" ? "ip" : "flow";
    return c.pairs.some((p) => p.reasons.some((r) => r.kind === kind));
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{t("intro", { minScore })}</p>
        {masked && <p className="mt-2 max-w-prose text-sm text-text-muted">{t("maskedNote")}</p>}
        <Link href="/admin/multi-comptes/bans" className="mt-2 inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4">
          {nb("listLink", { count: banCount })}
        </Link>
      </div>

      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <label className="flex flex-col gap-1 text-sm">{t("searchUser")}
          <input name="q" defaultValue={params.q} maxLength={40} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t("filter")}
          <select name="filter" defaultValue={params.filter} className={selectClass}>
            {FILTERS.map((f) => <option key={f} value={f}>{t(`filters.${f}`)}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="guests" value="1" defaultChecked={params.guests === "1"} className="size-5" />
          {t("includeGuests")}
        </label>
        <Button type="submit">{t("apply")}</Button>
      </form>

      <section className="flex flex-col gap-4">
        <h3 className="font-title text-xl font-bold">{t("clustersTitle", { count: clusters.length })}</h3>
        {clusters.length === 0 ? <p className="text-sm text-text-muted">{t("noClusters")}</p> : (
          clusters.slice(0, SHOWN).map((c, i) => (
            <article key={c.userIds.join("|")} className="flex flex-col gap-4 lacquer rounded-card p-4">
              <header className="flex flex-wrap items-center gap-3">
                <h4 className="font-title text-lg font-bold">{t("clusterTitle", { index: i + 1, count: c.userIds.length })}</h4>
                <ScoreBadge score={c.score} label={t("score", { score: c.score })} />
              </header>
              <MemberTable ids={c.userIds} members={members} masked={masked} caption={t("clusterTitle", { index: i + 1, count: c.userIds.length })} />
              {!masked && (c.userIds.length <= GROUP_BAN_MAX ? <GroupBanButton userIds={c.userIds} /> : <p className="text-sm text-text-muted">{nb("groupTooBig", { max: GROUP_BAN_MAX })}</p>)}
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">{t("pairsTitle", { count: c.pairs.length })}</summary>
                <div className="mt-2">
                  <PairList pairs={c.pairs} members={members} masked={masked} minScore={minScore} />
                </div>
              </details>
            </article>
          ))
        )}
        {clusters.length > SHOWN && <p className="text-sm text-text-muted">{t("moreClusters", { count: clusters.length - SHOWN })}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-title text-xl font-bold">{t("ipsTitle")}</h3>
        <p className="max-w-prose text-sm text-text-muted">{t("ipsIntro", { cap })}</p>
        {!masked && (
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="q" value={params.q} />
            <input type="hidden" name="filter" value={params.filter} />
            {params.guests && <input type="hidden" name="guests" value="1" />}
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">{t("searchIp")}
              <input name="ip" defaultValue={params.ip ?? ""} maxLength={64} inputMode="decimal" placeholder="86.245." className={inputClass} />
            </label>
            <Button type="submit">{t("searchIpButton")}</Button>
          </form>
        )}
        {ips.length === 0 ? <p className="text-sm text-text-muted">{t(ipSearch ? "noIpResult" : "noSharedIp")}</p> : (
          <ResponsiveTable
            caption={t("ipsTitle")}
            columns={[
              { key: "ip", label: t("kinds.IP"), primary: true },
              { key: "accounts", label: t("accounts"), className: "tabular-nums" },
              { key: "users", label: users("player"), className: "min-w-48" },
            ]}
            rows={ips.map((ip, i) => ({
              id: `ip-${i}`, // jamais l'IP en clé : elle partirait en clair dans la charge RSC du DEV
              cells: {
                ip: (
                  <span className="flex flex-col">
                    <span className="tabular-nums">{masked ? maskIp(ip.value) : ip.value}</span>
                    {ip.accounts > cap && <span className="text-xs text-text-muted">{t("publicIp")}</span>}
                    {bannedIps.has(ipBanKey(ip.value) ?? "") && <span className="text-xs font-bold text-shu">{nb("bannedBadge")}</span>}
                  </span>
                ),
                accounts: format.number(ip.accounts),
                users: (
                  <span className="text-xs break-all">
                    {ip.usernames.map((u, i) => (
                      <span key={u.id}>{i > 0 && ", "}<Link href={`/admin/utilisateurs/${u.id}`} className="underline underline-offset-2">{u.username}</Link></span>
                    ))}
                    {ip.accounts > ip.usernames.length && ` ${t("more", { count: ip.accounts - ip.usernames.length })}`}
                  </span>
                ),
              },
            }))}
          />
        )}
      </section>
    </div>
  );
}
