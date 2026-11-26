import { getTranslations } from "next-intl/server";
import { NetworkBanList } from "@/components/admin/NetworkBanList";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { Link } from "@/i18n/navigation";
import { z } from "@/lib/zod";
import { requireAdminView } from "@/server/admin";
import { listNetworkBans } from "@/server/anticheat/network-ban-queries";
import { getSetting } from "@/server/settings";

const SHOWN = 200;

// Recherche par IP (admin seulement, plainte d'un joueur) : chiffres, points, deux-points et hexadécimal
const paramsSchema = z.object({ ip: z.string().trim().regex(/^[0-9a-fA-F:.]{3,64}$/).optional().catch(undefined) });

/**
 * Bans réseau en place : IP et appareils bannis depuis une fiche joueur, un groupe de multi-comptes ou le suivi d'un
 * appareil, avec les passages bloqués. Ouverte au DEV en lecture, IP masquées ; seul l'ADMIN cherche une IP, lève un
 * ban ou rend définitif un ban qui expire (server/actions/admin-network-bans.ts).
 */
export default async function AdminNetworkBansPage({ searchParams }: PageProps<"/[locale]/admin/multi-comptes/bans">) {
  const { readOnly: masked } = await requireAdminView();
  const raw = await searchParams;
  const ipSearch = masked ? undefined : paramsSchema.parse({ ip: raw.ip }).ip;
  const [t, bans, followDevice, followIpv4, days, maxOthers, ipv4Days] = await Promise.all([
    getTranslations("admin.networkBans"),
    listNetworkBans({ take: SHOWN, ip: ipSearch }),
    getSetting("multiAccount.followDevice"),
    getSetting("multiAccount.followDeviceIpv4"),
    getSetting("multiAccount.autoBanDays"),
    getSetting("multiAccount.autoBanMaxOthers"),
    getSetting("multiAccount.ipv4BanDays"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/multi-comptes" className="inline-flex min-h-11 w-fit items-center text-sm text-link underline underline-offset-4">
        {t("back")}
      </Link>
      <div>
        <h2 className="font-heading text-2xl font-bold">{t("pageTitle")}</h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{t("pageIntro")}</p>
        <p className="mt-2 max-w-prose text-sm text-text-muted">
          {followDevice ? t("followOn", { days, max: maxOthers, ipv4: followIpv4 ? "yes" : "no" }) : t("followOff")}
        </p>
        {ipv4Days > 0 && <p className="mt-2 max-w-prose text-sm text-text-muted">{t("ipv4Expiry", { days: ipv4Days })}</p>}
        {masked && <p className="mt-2 max-w-prose text-sm text-text-muted">{t("maskedNote")}</p>}
      </div>
      {!masked && (
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {t("searchIp")}
            <input name="ip" defaultValue={ipSearch ?? ""} maxLength={64} inputMode="decimal" placeholder="86.245.12.3" className={inputClass} />
          </label>
          <Button type="submit">{t("searchIpButton")}</Button>
        </form>
      )}
      {bans.length === 0 ? (
        <p className="text-sm text-text-muted">{t(ipSearch ? "noIpResult" : "empty")}</p>
      ) : (
        <NetworkBanList bans={bans} masked={masked} caption={t("pageTitle")} />
      )}
      {bans.length === SHOWN && <p className="text-sm text-text-muted">{t("truncated", { count: SHOWN })}</p>}
    </div>
  );
}
