"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { adminCancelCoinFlipAction } from "@/server/actions/casino";
import { Button } from "../ui/Button";
import { inputClass } from "./fields";

const KNOWN = new Set(["NOT_FOUND", "NOT_OPEN", "RATE_LIMITED", "INVALID", "FORBIDDEN"]);

/** Retrait d'une table par la modération, avec un motif (journal) : la carte revient à son créateur. */
export function AdminCancelCoinFlipButton({ flipId }: { flipId: string }) {
  const t = useTranslations("admin.casino");
  const router = useRouter();
  const inputId = useId();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      try {
        const res = await adminCancelCoinFlipAction({ flipId, reason });
        if (res.ok) {
          setConfirming(false);
          router.refresh();
        } else setError(t(`errors.${KNOWN.has(res.error) ? (res.error as "INVALID") : "UNAVAILABLE"}`));
      } catch {
        setError(t("errors.unexpected"));
      }
    });

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {confirming ? (
        <>
          <label htmlFor={inputId} className="sr-only">
            {t("reason")}
          </label>
          <input
            id={inputId}
            value={reason}
            maxLength={200}
            placeholder={t("reason")}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            className={`${inputClass} sm:w-64`}
          />
          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={cancel} disabled={pending || reason.trim().length < 3}>
              {t("confirmCancel")}
            </Button>
            <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
              {t("keep")}
            </Button>
          </div>
        </>
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
