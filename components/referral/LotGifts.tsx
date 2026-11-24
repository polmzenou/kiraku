import { useTranslations } from "next-intl";
import type { LotView } from "@/server/economy/lot-view";
import { BoosterArt } from "../boosters/BoosterArt";
import { ZeniCoin } from "../layout/ZeniCoin";

/**
 * Cadeaux d'un lot en images : les vrais sachets du jeu avec leur nombre, les Zeni, les cartes, et le texte en clair à
 * côté (« 20 boosters », « 1 Jūbako »). `multiplier` : ×2 de l'Ennichi sur les étapes 1 et 2.
 */
export function LotGifts({ lot, multiplier = 1, compact = false, className = "" }: { lot: LotView | null; multiplier?: number; compact?: boolean; className?: string }) {
  const t = useTranslations("referralV2.gifts");
  const tRarity = useTranslations("rarity");
  if (!lot) return <p className={`text-xs text-text-muted ${className}`}>{t("none")}</p>;
  const m = Math.max(1, multiplier);
  const art = compact ? "w-5" : "w-7";
  return (
    <ul className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`} aria-label={t("label")}>
      {lot.lines.map((line, i) => (
        <li key={i} className="flex items-center gap-1.5 text-xs font-bold">
          {line.kind === "BOOSTER" ? (
            <>
              <span className={`${art} shrink-0`}>
                <BoosterArt shape={line.look.shape} theme={line.look.theme} emblem={line.look.emblem} name={line.name} contents={line.look.contents} compact flatShadow />
              </span>
              <span>{t("booster", { count: line.quantity * m, name: line.name })}</span>
            </>
          ) : line.kind === "CARD" ? (
            <span>{t("card", { count: line.quantity * m, name: line.name })}</span>
          ) : (
            <span>{t("rarityCard", { count: line.quantity * m, rarity: tRarity(line.rarity) })}</span>
          )}
        </li>
      ))}
      {lot.zeni > 0 && (
        <li className="flex items-center gap-1.5 text-xs font-bold text-kin">
          <ZeniCoin size={compact ? 14 : 18} />
          <span>{t("zeni", { amount: lot.zeni * m })}</span>
        </li>
      )}
    </ul>
  );
}
