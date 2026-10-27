"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Temps restant avant la sélection suivante (fenêtre de rotation des boosters) : les packs proposés et
 * la vedette changent. À l'échéance, la page se rafraîchit avec un léger décalage tiré au hasard, pour
 * que tous les onglets ouverts ne frappent pas la base à la même seconde, et jamais pendant une
 * célébration d'achat (dialog ouvert).
 */
export function ShopCountdown({ endsAt, initialNow }: { endsAt: number; initialNow: number }) {
  const t = useTranslations("economy.shop.featured");
  const router = useRouter();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    // Horloge du serveur : une horloge locale en avance rafraîchirait avant l'échéance, sans nouvelle sélection
    const skew = initialNow - Date.now();
    const serverNow = () => Date.now() + skew;
    const tick = setInterval(() => setNow(serverNow()), 30_000);
    let retry: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.querySelector("dialog[open]")) retry = setTimeout(refresh, 5_000);
      else router.refresh();
    };
    const jitter = Math.floor(Math.random() * 30_000);
    const reset = setTimeout(refresh, Math.max(0, endsAt - serverNow()) + 1_000 + jitter);
    return () => {
      clearInterval(tick);
      clearTimeout(reset);
      clearTimeout(retry);
    };
  }, [endsAt, initialNow, router]);

  const minutes = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return (
    <p className="text-xs text-text-muted tabular-nums">
      {minutes === 0
        ? t("refreshing")
        : minutes < 60
          ? t("nextSoon", { minutes })
          : hours < 24
            ? t("next", { hours, minutes: minutes % 60 })
            : t("nextDays", { days: Math.floor(hours / 24), hours: hours % 24 })}
    </p>
  );
}
