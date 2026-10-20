"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revokeReferralAction } from "@/server/actions/admin-economy";
import { Button } from "../ui/Button";

/** Révocation d'un parrainage (fraude), avec confirmation : irréversible. */
export function RevokeReferralButton({ referralId }: { referralId: string }) {
  const t = useTranslations("admin.economy");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const revoke = () =>
    startTransition(async () => {
      try {
        const res = await revokeReferralAction({ referralId });
        if (res.ok) router.refresh();
        else setError(t(`errors.${res.error}`));
      } catch {
        setError(t("errors.unexpected"));
      }
      setConfirming(false);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex gap-2">
          <Button type="button" variant="primary" onClick={revoke} disabled={pending}>
            {t("revokeConfirm")}
          </Button>
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setConfirming(true)}>
          {t("revoke")}
        </Button>
      )}
      {error && (
        <p className="text-sm text-shu" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
