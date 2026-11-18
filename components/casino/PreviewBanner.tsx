import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CasinoPhase } from "@/lib/casino/phase";

/** Bandeau de l'équipe avant l'ouverture : ce que les joueurs voient encore, et le lien vers les réglages. */
export function PreviewBanner({ phase }: { phase: CasinoPhase }) {
  const t = useTranslations("casino.preview");
  return (
    <p role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-kin/50 bg-kin/10 px-3 py-2 text-sm text-kin">
      <span>{t(phase === "hidden" ? "hidden" : "teaser")}</span>
      <Link href="/admin/casino" prefetch={false} className="font-bold underline underline-offset-4">
        {t("admin")}
      </Link>
    </p>
  );
}
