"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { keepNetworkBanAction, liftNetworkBanAction } from "@/server/actions/admin-network-bans";
import { Button } from "../ui/Button";
import { FormMessage, TextField } from "./fields";

/** Lever un ban, ou rendre définitif un ban automatique, avec une raison pour le journal. Réservé à l'ADMIN. */
export function NetworkBanRowActions({ banId, auto }: { banId: string; auto: boolean }) {
  const t = useTranslations("admin.networkBans");
  const [mode, setMode] = useState<"lift" | "keep" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!mode) return;
    startTransition(async () => {
      const input = { banId, reason: reason.trim() };
      const res = mode === "lift" ? await liftNetworkBanAction(input) : await keepNetworkBanAction(input);
      if (res.ok) {
        setMode(null);
        setReason("");
        setError(null);
      } else {
        setError(t(`errors.${res.error}`));
      }
    });
  }

  if (!mode) {
    return (
      <span className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="danger" onClick={() => setMode("lift")}>
          {t("lift")}
        </Button>
        {auto && (
          <Button type="button" size="sm" onClick={() => setMode("keep")}>
            {t("keep")}
          </Button>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-56 flex-col gap-2">
      <TextField label={t(mode === "lift" ? "liftReason" : "keepReason")} value={reason} onChange={setReason} maxLength={300} />
      <FormMessage message={error ? { tone: "error", text: error } : null} />
      <span className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "lift" ? "danger" : "secondary"} disabled={reason.trim() === "" || pending} onClick={confirm}>
          {t(mode === "lift" ? "liftConfirm" : "keepConfirm")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setMode(null)}>
          {t("cancel")}
        </Button>
      </span>
    </span>
  );
}
