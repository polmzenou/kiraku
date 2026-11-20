"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { SkippedKey } from "@/server/anticheat/network-ban-core";
import { banGroupAction } from "@/server/actions/admin-network-bans";
import { Button } from "../ui/Button";
import { FormMessage, TextField } from "./fields";

/**
 * Groupe suspect de /admin/multi-comptes : bannit tous ses comptes, et ce qui de leur réseau ne coupe personne
 * d'autre. Le compte rendu liste ce qui a été sauté (partagé hors du groupe, équipe, privé, trop partagé).
 */
export function GroupBanButton({ userIds }: { userIds: string[] }) {
  const t = useTranslations("admin.networkBans");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [skipped, setSkipped] = useState<SkippedKey[]>([]);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!window.confirm(t("groupConfirm", { count: userIds.length }))) return;
    startTransition(async () => {
      const res = await banGroupAction({ userIds, reason: reason.trim() });
      if (res.ok) {
        setMessage({ tone: "ok", text: t("groupDone", { accounts: res.accounts, bans: res.bans }) });
        setSkipped(res.skipped);
        setOpen(false);
        setReason("");
      } else {
        setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <>
          <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={300} hint={t("groupHint")} />
          <span className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" disabled={reason.trim() === "" || pending} onClick={submit}>
              {pending ? t("pending") : t("groupSubmit", { count: userIds.length })}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </span>
        </>
      ) : (
        <div>
          <Button type="button" variant="danger" onClick={() => setOpen(true)}>
            {t("groupOpen")}
          </Button>
        </div>
      )}
      <FormMessage message={message} />
      {skipped.length > 0 && (
        <div className="flex flex-col gap-1 text-sm text-text-muted">
          <p>{t("groupSkipped")}</p>
          <ul className="flex flex-col gap-1">
            {skipped.map((s, i) => (
              <li key={i} className="break-all">
                {t(`kinds.${s.kind}`)} {s.value} : {t(`states.${s.state}`, { count: 0 })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
