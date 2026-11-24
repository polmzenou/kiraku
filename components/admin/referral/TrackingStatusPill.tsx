import { useTranslations } from "next-intl";
import type { TrackingStatus } from "@/server/referral/tracking-queries";

const TONE: Record<TrackingStatus, string> = {
  ON_THE_WAY: "border-border bg-surface-2 text-text-muted",
  INSTALLED: "border-hisui/50 bg-hisui/10 text-hisui",
  HOOKED: "border-hisui/50 bg-hisui/10 text-hisui",
  LOYAL: "border-kin/60 bg-kin/10 text-kin",
  HELD: "border-shu/60 bg-shu/10 text-shu",
  REVOKED: "border-border bg-surface-2 text-text-muted",
  BANNED: "border-shu/60 bg-shu/10 text-shu",
};

/** Pastille du statut d'un parrainage v2 (suivi et fiche de l'équipe). */
export function TrackingStatusPill({ status }: { status: TrackingStatus }) {
  const t = useTranslations("admin.referralV2.status");
  return <span className={`inline-flex min-h-7 items-center rounded-pill border px-3 text-xs font-bold whitespace-nowrap ${TONE[status]}`}>{t(status)}</span>;
}
