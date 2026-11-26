import { getFormatter, getTranslations } from "next-intl/server";
import { ResponsiveTable, type TableColumn } from "@/components/admin/ResponsiveTable";
import { Link } from "@/i18n/navigation";
import { BLOCKED_DEVICES_MAX, SHARED_DEVICES_HINT } from "@/lib/anticheat/network";
import { maskedKey } from "@/server/anticheat/network-ban-core";
import type { NetworkBanItem } from "@/server/anticheat/network-ban-queries";
import { NetworkBanRowActions } from "./NetworkBanRowActions";

type Key = "value" | "source" | "account" | "reason" | "created" | "hits" | "actions";

/**
 * Bans réseau en place (fiche joueur, /admin/multi-comptes/bans). `masked` (DEV) : IP masquées ici, avant le rendu,
 * et aucune action. Un appareil ne montre jamais que le début de son identifiant. Passages comptés une fois par
 * 10 minutes et par réseau ; un ban d'IP compte en plus les appareils distincts qu'il bloque.
 */
export async function NetworkBanList({ bans, masked, caption }: { bans: readonly NetworkBanItem[]; masked: boolean; caption: string }) {
  const [t, format] = await Promise.all([getTranslations("admin.networkBans"), getFormatter()]);
  const label = (kind: NetworkBanItem["kind"], value: string) => (kind === "IP" && !masked ? value : maskedKey(kind, value));
  const date = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });

  const columns: TableColumn<Key>[] = [
    { key: "value", label: t("columns.value"), primary: true },
    { key: "source", label: t("columns.source"), className: "min-w-40" },
    { key: "account", label: t("columns.account") },
    { key: "reason", label: t("columns.reason"), className: "min-w-40" },
    { key: "created", label: t("columns.created"), className: "whitespace-nowrap" },
    { key: "hits", label: t("columns.hits"), className: "whitespace-nowrap" },
    ...(masked ? [] : [{ key: "actions" as const, label: t("columns.actions"), actions: true }]),
  ];

  return (
    <ResponsiveTable
      caption={caption}
      columns={columns}
      rows={bans.map((b) => ({
        id: b.id,
        cells: {
          value: (
            <span className="flex flex-col">
              <span className="text-xs text-text-muted">{t(`kinds.${b.kind}`)}</span>
              <span className="break-all font-bold tabular-nums">{label(b.kind, b.value)}</span>
            </span>
          ),
          source: (
            <span className="flex flex-col text-sm">
              <span>{t(`sources.${b.source}`)}</span>
              {b.parent && <span className="text-xs text-text-muted">{t("follows", { device: label(b.parent.kind, b.parent.value) })}</span>}
              {b.followed > 0 && <span className="text-xs text-text-muted">{t("followed", { count: b.followed })}</span>}
              <span className="text-xs text-text-muted">{b.expiresAt ? t("expires", { date: date(b.expiresAt) }) : t("permanent")}</span>
            </span>
          ),
          account: b.user ? (
            <Link href={`/admin/utilisateurs/${b.user.id}`} className="font-bold text-link underline underline-offset-4">
              {b.user.username}
            </Link>
          ) : (
            <span className="text-text-muted">{t("noAccount")}</span>
          ),
          reason: <span className="text-sm break-words">{b.reason}</span>,
          created: (
            <span className="flex flex-col text-sm">
              <span>{date(b.createdAt)}</span>
              {b.createdBy && <span className="text-xs text-text-muted">{t("by", { admin: b.createdBy })}</span>}
            </span>
          ),
          hits: (
            <span className="flex flex-col text-sm">
              <span className="tabular-nums">{t("hits", { count: b.hits })}</span>
              {b.lastHitAt && <span className="text-xs text-text-muted">{t("lastHit", { date: date(b.lastHitAt) })}</span>}
              {/* Ban d'IP : appareils déjà connus qu'il bloque ; plusieurs foyers derrière une même IP se voient ici */}
              {b.kind === "IP" && b.devices > 0 && (
                <span className={`text-xs tabular-nums ${b.devices > SHARED_DEVICES_HINT ? "font-bold text-kin" : "text-text-muted"}`}>
                  {t("devices", { count: b.devices, full: b.devices >= BLOCKED_DEVICES_MAX ? "yes" : "no" })}
                </span>
              )}
              {b.kind === "IP" && b.devices > SHARED_DEVICES_HINT && <span className="text-xs text-kin">{t("devicesHint")}</span>}
            </span>
          ),
          actions: masked ? null : <NetworkBanRowActions banId={b.id} expiring={b.expiresAt !== null} followsDevice={b.source === "AUTO" && b.parent !== null} />,
        },
      }))}
    />
  );
}
