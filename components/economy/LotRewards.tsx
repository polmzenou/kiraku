import { useTranslations } from "next-intl";
import type { LotView } from "@/server/economy/lot-view";
import { ZeniCoin } from "../layout/ZeniCoin";

/** Contenu d'un lot en pastilles : Zeni, boosters, cartes. */
export function LotRewards({ lot, className = "" }: { lot: LotView | undefined; className?: string }) {
  const t = useTranslations("economy.lot");
  const tRarity = useTranslations("rarity");
  if (!lot) return <p className={`text-sm text-text-muted ${className}`}>{t("missing")}</p>;

  const chip = "inline-flex min-h-7 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 text-xs font-bold";
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label={t("label")}>
      {lot.zeni > 0 && (
        <li className={`${chip} text-kin`}>
          <ZeniCoin size={12} />
          {t("zeni", { amount: lot.zeni })}
        </li>
      )}
      {lot.lines.map((line, i) => (
        <li key={i} className={chip}>
          {line.kind === "BOOSTER" && t("booster", { count: line.quantity, name: line.name })}
          {line.kind === "CARD" && t("card", { count: line.quantity, name: line.name, rarity: tRarity(line.rarity) })}
          {line.kind === "RARITY_CARD" && t("rarityCard", { count: line.quantity, rarity: tRarity(line.rarity) })}
        </li>
      ))}
    </ul>
  );
}
