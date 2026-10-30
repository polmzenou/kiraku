"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setAppearOfflineAction } from "@/server/actions/presence";

/** « Apparaître hors ligne » (ADMIN, DEV) : enregistré aussitôt, comme la confidentialité. */
export function AppearOfflineToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("presence");
  const [offline, setOffline] = useState(initial);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: boolean) => {
    const previous = offline;
    setOffline(next);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await setAppearOfflineAction({ offline: next });
        if (!res.ok) throw new Error(res.error);
        setStatus("saved");
      } catch {
        setOffline(previous);
        setStatus("error");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2" aria-busy={pending}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border px-3 py-2.5">
        <input type="checkbox" checked={offline} disabled={pending} onChange={(e) => save(e.target.checked)} className="mt-1 choice" />
        <span className="flex flex-col">
          <span className="font-bold">{t("appearOffline")}</span>
          <span className="text-sm text-text-muted">{t("appearOfflineHint")}</span>
        </span>
      </label>
      <p role="status" className={`text-sm ${status === "error" ? "text-shu" : "text-text-muted"}`}>
        {status === "saved" ? t("saved") : status === "error" ? t("error") : ""}
      </p>
    </div>
  );
}
