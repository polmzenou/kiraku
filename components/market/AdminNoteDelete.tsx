"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearMarketNoteAction } from "@/server/actions/admin-market";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

/** Poubelle de la modération à côté d'un commentaire public : rendue seulement pour un admin. */
export function AdminNoteDelete({ kind, id }: { kind: "LISTING" | "AUCTION"; id: string }) {
  const t = useTranslations("market.adminNote");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clear = () =>
    startTransition(async () => {
      try {
        const res = await clearMarketNoteAction({ kind, id });
        if (res.ok) router.refresh();
        else setError(t(`errors.${res.error}`));
      } catch {
        setError(t("errors.UNAVAILABLE"));
      }
      setConfirming(false);
    });

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {confirming ? (
        <div className="flex gap-2">
          <Button type="button" onClick={() => setConfirming(false)} disabled={pending}>
            {t("keep")}
          </Button>
          <Button type="button" variant="primary" onClick={clear} disabled={pending}>
            {t("confirm")}
          </Button>
        </div>
      ) : (
        <IconButton tone="shu" aria-label={t("delete")} title={t("delete")} onClick={() => setConfirming(true)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </IconButton>
      )}
      {error && (
        <p className="text-xs text-shu" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
