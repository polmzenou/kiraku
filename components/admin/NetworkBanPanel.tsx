import { getFormatter, getTranslations } from "next-intl/server";
import { maskedKey } from "@/server/anticheat/network-ban-core";
import { listNetworkBans, networkBanRows } from "@/server/anticheat/network-ban-queries";
import { NetworkBanForm, type NetworkBanFormRow } from "./NetworkBanForm";
import { NetworkBanList } from "./NetworkBanList";
import { ReadOnly } from "./ReadOnly";

/**
 * Fiche joueur : bannir son réseau (IP et appareils relevés par la détection des multi-comptes), avec ou sans le
 * compte, et les bans déjà venus de lui. Le DEV voit tout en lecture seule, valeurs masquées avant le rendu.
 */
export async function NetworkBanPanel({ userId, readOnly, accountBanned, staffTarget }: { userId: string; readOnly: boolean; accountBanned: boolean; staffTarget: boolean }) {
  const [rows, bans, t, format] = await Promise.all([networkBanRows(userId), listNetworkBans({ userId, take: 50 }), getTranslations("admin.networkBans"), getFormatter()]);
  const formRows: NetworkBanFormRow[] = rows.map((r) => ({
    signalIds: r.signalIds,
    kind: r.kind,
    label: r.kind === "IP" && !readOnly ? r.value : maskedKey(r.kind, r.value),
    lastSeen: format.dateTime(r.lastSeenAt, { dateStyle: "short", timeStyle: "short" }),
    state: r.state,
    selectable: r.selectable,
    checked: r.checked,
    others: r.others,
    othersCount: r.othersCount,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="font-title text-lg font-bold">{t("panelTitle")}</h4>
        <p className="text-sm text-text-muted">{t("panelIntro")}</p>
      </div>
      {staffTarget ? (
        <p className="text-sm text-text-muted">{t("staffTarget")}</p>
      ) : (
        <ReadOnly when={readOnly}>
          <NetworkBanForm userId={userId} rows={formRows} accountBanned={accountBanned} />
        </ReadOnly>
      )}
      {bans.length > 0 && <NetworkBanList bans={bans} masked={readOnly} caption={t("userBansTitle")} />}
    </div>
  );
}
