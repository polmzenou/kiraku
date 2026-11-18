"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";

const DAY = 86_400;

/**
 * Compte à rebours jusqu'à l'ouverture, calé sur l'heure du serveur (l'horloge du téléphone ne compte que
 * l'écoulement). À zéro, la page se recharge : le casino ouvert remplace le teaser.
 */
export function OpeningCountdown({ opensAt, serverNow }: { opensAt: number; serverNow: number }) {
  const t = useTranslations("casino.teaser");
  const router = useRouter();
  const [offset] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(serverNow);
  const left = Math.max(0, Math.floor((opensAt - now) / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);

  useEffect(() => {
    if (left > 0) return;
    // Une petite marge : l'ouverture côté serveur est passée quand la page se recharge
    const id = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(id);
  }, [left, router]);

  if (left === 0) {
    return (
      <p role="status" className="font-title text-lg font-bold text-kin">
        {t("opening")}
      </p>
    );
  }

  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const cells = [
    { value: days, label: t("days", { count: days }) },
    { value: hours, label: t("hours", { count: hours }) },
    { value: minutes, label: t("minutes") },
    { value: seconds, label: t("seconds") },
  ];
  return (
    <div role="timer" aria-label={t("countdown")} className="grid grid-cols-4 gap-2">
      {cells.map((c) => (
        <span key={c.label} className="flex flex-col items-center rounded-control bg-bg/70 py-2 ring-1 ring-kin/30 ring-inset">
          <b className="font-heading text-2xl leading-tight font-normal tabular-nums">{String(c.value).padStart(2, "0")}</b>
          <small className="text-xs text-text-muted">{c.label}</small>
        </span>
      ))}
    </div>
  );
}
