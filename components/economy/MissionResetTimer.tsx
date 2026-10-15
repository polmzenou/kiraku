"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";

/** Le compte à rebours reste à jour et renouvelle la sélection même si la page reste ouverte. */
export function MissionResetTimer({ endsAt, initialNow }: { endsAt: number; initialNow: number }) {
  const t = useTranslations("economy.missions");
  const router = useRouter();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    const reset = setTimeout(() => router.refresh(), Math.max(0, endsAt - Date.now()) + 1_000);
    return () => { clearInterval(tick); clearTimeout(reset); };
  }, [endsAt, router]);

  const minutes = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return (
    <p className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted tabular-nums">
      {minutes === 0 ? t("refreshing") : hours >= 24
        ? t("resetsDays", { days: Math.floor(hours / 24), hours: hours % 24 })
        : t("resetsHours", { hours, minutes: minutes % 60 })}
    </p>
  );
}
