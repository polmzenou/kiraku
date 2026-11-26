import { getFormatter, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { after } from "next/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { deletionDueAt } from "@/lib/account/deletion";
import { isNetworkGateFree, isTermsGateFree, needsTermsAcceptance } from "@/lib/legal/legal";
import { blockingBan, noteBlocked, requestNetworkBan } from "@/server/anticheat/network-ban";
import { getSetting } from "@/server/settings";
import { getCurrentUser } from "@/server/user";
import { NetworkBanScreen } from "../anticheat/NetworkBanScreen";
import { TermsAcceptScreen } from "./TermsAcceptScreen";

/**
 * Entre l'en-tête et la page. Depuis un réseau banni (IP ou appareil), tout visiteur hors équipe voit l'écran du
 * ban à la place de la page (sauf textes légaux et connexion). Un compte inscrit qui n'a pas accepté la version
 * exigée des CGU voit l'écran d'acceptation (sauf pages légales et connexion). Un compte dont la suppression est
 * demandée voit un rappel avec le lien pour l'annuler.
 */
export async function AccountGate({ children }: { children: ReactNode }) {
  const [user, networkBan, path] = await Promise.all([
    getCurrentUser(),
    requestNetworkBan(),
    headers().then((h) => h.get("x-kiraku-path") ?? "/"),
  ]);
  const blocking = blockingBan(networkBan, user?.role);
  if (blocking && !isNetworkGateFree(path)) {
    after(() => noteBlocked(blocking));
    return <NetworkBanScreen />;
  }
  if (!user) return children;

  const required = await getSetting("legal.termsRequiredVersion");
  if (needsTermsAcceptance(user, required) && !isTermsGateFree(path)) {
    return <TermsAcceptScreen version={required} firstTime={user.termsVersion === null} />;
  }

  if (user.deletionRequestedAt && !user.anonymizedAt) {
    const [t, format, grace] = await Promise.all([
      getTranslations("data.deletion"),
      getFormatter(),
      getSetting("account.deletionGraceDays"),
    ]);
    const due = deletionDueAt(user.deletionRequestedAt, grace);
    return (
      <>
        <div role="status" className="border-b border-shu bg-surface px-4 py-2 text-center text-sm">
          {t("pendingNotice", { date: format.dateTime(due, { dateStyle: "long" }) })}{" "}
          <Link href="/compte/donnees" className="font-bold text-shu underline underline-offset-4">
            {t("cancelLink")}
          </Link>
        </div>
        {children}
      </>
    );
  }
  return children;
}
