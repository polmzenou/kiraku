import { useFormatter, useTranslations } from "next-intl";
import type { StepRow } from "@/server/referral/queries";

/**
 * Avancement d'une étape en cours : la jauge, « 12 boosters sur 20 » ou « 3 jours sur 5 », et sa date utile (étape 2 :
 * versée au plus tôt à la fin des premières heures ; étapes 3 et 4 : fin de la fenêtre). Dates dans le fuseau du jeu.
 */
export function StepMeter({ row, step, timeZone }: { row: Pick<StepRow, "have" | "need" | "readyAt" | "deadline">; step: number; timeZone: string }) {
  const t = useTranslations("referralV2.meter");
  const format = useFormatter();
  if (row.need <= 1) return null;
  const date = (iso: string, withTime: boolean) =>
    format.dateTime(new Date(iso), withTime ? { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone } : { day: "numeric", month: "short", timeZone });
  const when = row.readyAt ? t("readyAt", { date: date(row.readyAt, true) }) : row.deadline ? t("deadline", { date: date(row.deadline, false) }) : null;
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span className="block h-full origin-left rounded-full bg-shu" style={{ transform: `scaleX(${Math.min(1, row.have / row.need)})` }} />
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
        {t(step === 2 ? "openings" : "days", { have: row.have, need: row.need })}
        {when && ` · ${when}`}
      </span>
    </div>
  );
}
