"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { decideAmbassadorAction } from "@/server/actions/admin-referral";
import { Button } from "../../ui/Button";
import { FormMessage } from "../fields";

/**
 * Décision de l'équipe (ADMIN et DEV) sur un Ambassadeur proposé par le parrainage : accepter pose le rôle et prévient
 * le joueur, refuser ferme la proposition. Une confirmation d'un clic avant d'écrire.
 */
export function AmbassadorActions({ proposalId, name, banned }: { proposalId: string; name: string; banned: boolean }) {
  const t = useTranslations("admin.referralV2.ambassador");
  const [confirm, setConfirm] = useState<"ACCEPT" | "REFUSE" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function decide(accept: boolean) {
    setMessage(null);
    startTransition(async () => {
      const res = await decideAmbassadorAction({ proposalId, accept });
      setConfirm(null);
      if (!res.ok) return setMessage({ tone: "error", text: t(`errors.${res.error}`) });
      setDone(true);
      setMessage({ tone: "ok", text: t(accept ? "done.accept" : "done.refuse") });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {!done &&
        (confirm === null ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" disabled={pending || banned} onClick={() => setConfirm("ACCEPT")}>
              {t("accept")}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => setConfirm("REFUSE")}>
              {t("refuse")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-2 p-3">
            <p className="text-sm font-bold">{confirm === "ACCEPT" ? t("confirmAccept", { name }) : t("confirmRefuse", { name })}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={confirm === "ACCEPT" ? "primary" : "danger"} size="sm" disabled={pending} onClick={() => decide(confirm === "ACCEPT")}>
                {t("confirm")}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ))}
      <FormMessage message={message} />
    </div>
  );
}
