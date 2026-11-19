import { useTranslations } from "next-intl";
import { toRoman } from "@/lib/prestige/roman";
import "./prestige.css";

/** Bandeau sous le pseudo d'un joueur au prestige 1 ou plus : 転生 III · 7ᵉ renaissance de Kiraku. */
export function PrestigeBand({ prestige, globalRank }: { prestige: number; globalRank: number | null }) {
  const t = useTranslations("prestige.profile");
  if (prestige < 1) return null;
  return (
    <p className="pr-band">
      <span aria-hidden="true" lang="ja" className="rounded-[4px] bg-shu-btn px-1 pb-0.5 font-seal text-xs text-washi-paper">
        転生
      </span>
      <span className="font-title text-[15px] font-extrabold tracking-wide">{toRoman(prestige)}</span>
      <span className="sr-only">{t("level", { level: prestige })}</span>
      {globalRank !== null && <span>{t("rank", { rank: globalRank })}</span>}
    </p>
  );
}
