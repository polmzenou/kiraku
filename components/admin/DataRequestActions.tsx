"use client";

import { useTranslations } from "next-intl";
import { adminAnonymizeAction, adminCancelDeletionAction, type AdminDataResult } from "@/server/actions/admin-data";
import { ConfirmAction } from "./ConfirmAction";

/** Actions d'une demande de suppression en attente : anonymiser tout de suite, ou annuler. */
export function DataRequestActions({ userId, username, showCancel = true }: { userId: string; username: string; showCancel?: boolean }) {
  const t = useTranslations("admin.data");
  const message = (r: AdminDataResult) => (r.ok ? null : t(`errors.${r.error}`));

  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction
        label={t("anonymizeNow")}
        title={t("anonymizeTitle", { username })}
        description={<p>{t("anonymizeBody")}</p>}
        confirmLabel={t("anonymizeConfirm")}
        typeToConfirm={username}
        onConfirm={async (typed) => message(await adminAnonymizeAction({ userId, confirm: typed }))}
      />
      {showCancel && (
        <ConfirmAction
          label={t("cancelDeletion")}
          title={t("cancelTitle", { username })}
          description={<p>{t("cancelBody")}</p>}
          confirmLabel={t("cancelConfirm")}
          variant="secondary"
          onConfirm={async () => message(await adminCancelDeletionAction({ userId }))}
        />
      )}
    </div>
  );
}
