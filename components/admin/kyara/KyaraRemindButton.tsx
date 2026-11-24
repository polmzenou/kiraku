"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { remindKyaraImportAction, type KyaraStaffError } from "@/server/actions/admin-kyara";
import { Button } from "../../ui/Button";

/**
 * « Relance » d'une demande en attente dans la file de /admin/kyara : le joueur reçoit une notification qui lui
 * rappelle d'aller montrer sa collection au compte Kiraku sur Kyara. Une fois envoyée, le bouton reste grisé.
 */
export function KyaraRemindButton({ importId, player }: { importId: string; player: string }) {
  const t = useTranslations("admin.kyara.queue");
  const tError = useTranslations("admin.kyara.errors");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<KyaraStaffError | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        size="sm"
        disabled={pending || sent}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await remindKyaraImportAction({ importId });
            if (res.ok) setSent(true);
            else setError(res.error);
          })
        }
      >
        {pending ? t("remindPending") : sent ? t("remindDone") : t("remind")}
        <span className="sr-only"> {player}</span>
      </Button>
      {error && (
        <span role="alert" className="text-xs text-shu">
          {tError(error)}
        </span>
      )}
    </span>
  );
}
