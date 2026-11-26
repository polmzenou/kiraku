"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { keepNetworkBanAction, liftNetworkBanAction } from "@/server/actions/admin-network-bans";
import { Button } from "../ui/Button";
import { FormMessage, TextField } from "./fields";

type Mode = "lift" | "exempt" | "keep";

/**
 * Lever un ban, rendre définitif un ban qui expire (`expiring`), ou, pour un ban automatique qui suit un appareil
 * (`followsDevice`), le lever en exemptant l'IP du suivi (sans quoi le prochain passage de l'appareil la rebannit).
 * Une raison pour le journal. Réservé à l'ADMIN.
 */
export function NetworkBanRowActions({ banId, expiring, followsDevice }: { banId: string; expiring: boolean; followsDevice: boolean }) {
  const t = useTranslations("admin.networkBans");
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!mode) return;
    startTransition(async () => {
      const input = { banId, reason: reason.trim() };
      const res = mode === "keep" ? await keepNetworkBanAction(input) : await liftNetworkBanAction({ ...input, exempt: mode === "exempt" });
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
        {followsDevice && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setMode("exempt")}>
            {t("exempt")}
          </Button>
        )}
        {expiring && (
          <Button type="button" size="sm" onClick={() => setMode("keep")}>
            {t("keep")}
          </Button>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-56 flex-col gap-2">
      <TextField label={t(mode === "keep" ? "keepReason" : "liftReason")} value={reason} onChange={setReason} maxLength={300} hint={mode === "exempt" ? t("exemptHint") : undefined} />
      <FormMessage message={error ? { tone: "error", text: error } : null} />
      <span className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "keep" ? "secondary" : "danger"} disabled={reason.trim() === "" || pending} onClick={confirm}>
          {t(mode === "keep" ? "keepConfirm" : mode === "exempt" ? "exemptConfirm" : "liftConfirm")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setMode(null)}>
          {t("cancel")}
        </Button>
      </span>
    </span>
  );
}
