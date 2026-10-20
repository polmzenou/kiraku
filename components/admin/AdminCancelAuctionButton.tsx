"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminCancelAuctionAction } from "@/server/actions/market";
import { Button } from "../ui/Button";

/** Annulation d'une vente par la modération, avec confirmation : la mise en tête est rendue. */
export function AdminCancelAuctionButton({ auctionId }: { auctionId: string }) {
  const t = useTranslations("admin.market");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      try {
        const res = await adminCancelAuctionAction({ auctionId });
        if (res.ok) router.refresh();
        else setError(t(`errors.${res.error === "CLOSED" || res.error === "NOT_FOUND" || res.error === "RATE_LIMITED" || res.error === "INVALID" ? res.error : "UNAVAILABLE"}`));
      } catch {
        setError(t("errors.unexpected"));
      }
      setConfirming(false);
    });

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      {confirming ? (
        <div className="flex gap-2">
          <Button type="button" variant="primary" onClick={cancel} disabled={pending}>
            {t("confirmCancel")}
          </Button>
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            {t("keep")}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setConfirming(true)}>
          {t("cancel")}
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
