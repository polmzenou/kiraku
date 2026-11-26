"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import type { BanState, NetworkKind } from "@/lib/anticheat/network";
import { banNetworkAction } from "@/server/actions/admin-network-bans";
import { Button } from "../ui/Button";
import { FormMessage, TextField, Toggle } from "./fields";

/** Une IP (clé /64 pour une IPv6) ou un appareil du joueur, déjà masqué pour le DEV et daté côté serveur. */
export type NetworkBanFormRow = {
  signalIds: string[];
  kind: NetworkKind;
  label: string;
  lastSeen: string;
  state: BanState;
  selectable: boolean;
  checked: boolean;
  others: { id: string; username: string }[];
  othersCount: number;
};

const STATE_TONE: Record<BanState, string> = {
  OK: "text-text-muted",
  SHARED: "text-kin",
  BANNED: "text-shu",
  STAFF: "text-text-muted",
  PRIVATE: "text-text-muted",
  CAP: "text-text-muted",
};

/**
 * Fiche joueur : les IP et appareils à bannir (précochés s'ils ne coupent personne d'autre), et le compte. Une ligne
 * partagée nomme les comptes actifs qu'elle couperait aussi. Le DEV le voit désactivé (ReadOnly).
 */
export function NetworkBanForm({ userId, rows, accountBanned }: { userId: string; rows: NetworkBanFormRow[]; accountBanned: boolean }) {
  const t = useTranslations("admin.networkBans");
  const [selected, setSelected] = useState(() => new Set(rows.filter((r) => r.checked).map((r) => r.signalIds[0])));
  const [banAccount, setBanAccount] = useState(!accountBanned);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Une ligne devenue « Déjà bannie » après un ban sort de la sélection (la confirmation ne la compte plus)
  const chosen = rows.filter((r) => r.selectable && selected.has(r.signalIds[0]));
  const cut = chosen.reduce((n, r) => n + r.othersCount, 0);
  const withAccount = banAccount && !accountBanned;
  const canSubmit = reason.trim() !== "" && (chosen.length > 0 || withAccount);

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    if (!window.confirm(t("confirm", { count: chosen.length, cut, account: withAccount ? "yes" : "no" }))) return;
    startTransition(async () => {
      // Un relevé par ligne suffit : le serveur retrouve la clé (IPv4, /64 ou appareil). Tous les relevés d'un /64
      // (une adresse par jour et par appareil) dépassaient vite la borne de l'action
      const signalIds = chosen.map((r) => r.signalIds[0]).filter((s): s is string => Boolean(s));
      const res = await banNetworkAction({ userId, signalIds, banAccount: withAccount, reason: reason.trim() });
      if (res.ok) {
        setMessage({ tone: "ok", text: t("done", { count: res.bans, account: res.account ? "yes" : "no" }) });
        setReason("");
      } else {
        setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("noKeys")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.signalIds[0]} className="lacquer rounded-card p-3">
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="choice mt-1 shrink-0"
                  disabled={!r.selectable}
                  checked={selected.has(r.signalIds[0])}
                  onChange={(e) => toggle(r.signalIds[0], e.target.checked)}
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-text-muted">
                    {t(`kinds.${r.kind}`)} · {t("lastSeen", { date: r.lastSeen })}
                  </span>
                  <span className="break-all font-bold tabular-nums">{r.label}</span>
                  <span className={`text-sm ${STATE_TONE[r.state]}`}>{t(`states.${r.state}`, { count: r.othersCount })}</span>
                  {r.others.length > 0 && (
                    <span className="text-xs break-all">
                      {t("cuts")}{" "}
                      {r.others.map((o, i) => (
                        <span key={o.id}>
                          {i > 0 && ", "}
                          <Link href={`/admin/utilisateurs/${o.id}`} className="underline underline-offset-2">
                            {o.username}
                          </Link>
                        </span>
                      ))}
                      {r.othersCount > r.others.length && ` ${t("more", { count: r.othersCount - r.others.length })}`}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {accountBanned ? (
        <p className="text-sm text-text-muted">{t("accountAlreadyBanned")}</p>
      ) : (
        <Toggle label={t("banAccount")} checked={banAccount} onChange={setBanAccount} />
      )}
      <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={300} hint={t("reasonHint")} />
      <FormMessage message={message} />
      <div>
        <Button type="button" variant="danger" disabled={!canSubmit || pending} onClick={submit}>
          {pending ? t("pending") : t("submit")}
        </Button>
      </div>
    </div>
  );
}
