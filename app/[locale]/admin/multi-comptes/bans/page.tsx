import { getTranslations } from "next-intl/server";
import { NetworkBanList } from "@/components/admin/NetworkBanList";
import { Link } from "@/i18n/navigation";
import { requireAdminView } from "@/server/admin";
import { listNetworkBans } from "@/server/anticheat/network-ban-queries";
import { getSetting } from "@/server/settings";

const SHOWN = 200;

/**
 * Bans réseau en place : IP et appareils bannis depuis une fiche joueur, un groupe de multi-comptes ou le suivi d'un
 * appareil, avec les accès bloqués. Ouverte au DEV en lecture, IP masquées ; seul l'ADMIN lève un ban ou rend
 * définitif un ban automatique (server/actions/admin-network-bans.ts).
 */
export default async function AdminNetworkBansPage() {
  const { readOnly: masked } = await requireAdminView();
  const [t, bans, followDevice, days] = await Promise.all([
    getTranslations("admin.networkBans"),
    listNetworkBans({ take: SHOWN }),
    getSetting("multiAccount.followDevice"),
    getSetting("multiAccount.autoBanDays"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/multi-comptes" className="inline-flex min-h-11 w-fit items-center text-sm text-link underline underline-offset-4">
        {t("back")}
      </Link>
      <div>
        <h2 className="font-heading text-2xl font-bold">{t("pageTitle")}</h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{t("pageIntro")}</p>
        <p className="mt-2 max-w-prose text-sm text-text-muted">{followDevice ? t("followOn", { days }) : t("followOff")}</p>
        {masked && <p className="mt-2 max-w-prose text-sm text-text-muted">{t("maskedNote")}</p>}
      </div>
      {bans.length === 0 ? <p className="text-sm text-text-muted">{t("empty")}</p> : <NetworkBanList bans={bans} masked={masked} caption={t("pageTitle")} />}
      {bans.length === SHOWN && <p className="text-sm text-text-muted">{t("truncated", { count: SHOWN })}</p>}
    </div>
  );
}
