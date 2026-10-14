import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import type { LotView } from "@/server/economy/lot-view";
import { BoosterArt } from "../boosters/BoosterArt";
import { Fuda } from "../fuda/Fuda";
import { CardBack } from "../fuda/CardBack";
import { ZeniCoin } from "../layout/ZeniCoin";

/** Motif seigaiha doré en filigrane derrière le lot. */
const PATTERN = { background: "var(--wagara)", "--wl": "rgb(217 181 86 / 0.35)" } as CSSProperties;

/** Positions de l'éventail de sachets (jusqu'à trois visibles). */
const FAN = [
  "z-10 -rotate-[10deg] -translate-x-[42%] translate-y-[4%]",
  "z-20 translate-y-[-2%]",
  "z-10 rotate-[10deg] translate-x-[42%] translate-y-[4%]",
];

/**
 * Aperçu d'un lot sur une scène : les sachets en éventail, une fuda précise, une carte face cachée
 * (tirée au hasard dans une rareté) ou une pile de pièces. Décoratif : le contenu est dit en texte
 * par LotRewards juste en dessous.
 */
export function LotStage({ lot, className = "" }: { lot: LotView | undefined; className?: string }) {
  const t = useTranslations("economy.lot");
  const tRarity = useTranslations("rarity");
  const booster = lot?.lines.find((l) => l.kind === "BOOSTER");
  const card = lot?.lines.find((l) => l.kind === "CARD");
  const mystery = lot?.lines.find((l) => l.kind === "RARITY_CARD");

  let content: ReactNode;
  let badge: string | null = null;

  if (booster && booster.kind === "BOOSTER") {
    const shown = Math.min(3, booster.quantity);
    const fan = shown === 1 ? [FAN[1]] : shown === 2 ? [FAN[0], FAN[2]] : FAN;
    badge = booster.quantity > 1 ? `×${booster.quantity}` : null;
    content = (
      <div className="relative flex h-full w-full items-center justify-center">
        {fan.map((pos, i) => (
          <div key={i} className={`absolute w-[30%] max-w-28 [container-type:inline-size] ${pos}`}>
            <BoosterArt
              shape={booster.look.shape}
              theme={booster.look.theme}
              emblem={booster.look.emblem}
              name={booster.name}
              contents={booster.look.contents}
              compact
            />
          </div>
        ))}
      </div>
    );
  } else if (card && card.kind === "CARD" && card.card) {
    badge = card.quantity > 1 ? `×${card.quantity}` : null;
    content = (
      <div className="w-[34%] max-w-32 -rotate-3">
        <Fuda card={card.card} size="sm" />
      </div>
    );
  } else if (mystery && mystery.kind === "RARITY_CARD") {
    badge = mystery.quantity > 1 ? `×${mystery.quantity}` : null;
    content = (
      <div className="relative w-[32%] max-w-28 rotate-2">
        <div className="relative aspect-[5/7]">
          <CardBack static className="absolute inset-0" />
        </div>
        <span
          className="absolute -top-2 -right-3 flex items-center gap-1 rounded-full bg-kin px-2 py-0.5 text-[11px] font-bold text-sumi shadow-paper"
          aria-hidden="true"
        >
          <span lang="ja" className="font-seal">
            {RARITY_SEAL[mystery.rarity]}
          </span>
          {tRarity(mystery.rarity)}
        </span>
      </div>
    );
  } else {
    content = (
      <div className="flex items-end gap-1">
        <ZeniCoin size={44} />
        <ZeniCoin size={60} />
        <ZeniCoin size={40} />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_60%,var(--color-surface-2)_0%,var(--color-bg)_80%)] ${className}`}
    >
      <span className="wagara-seigaiha absolute inset-0 opacity-25" style={PATTERN} />
      {content}
      {badge && (
        <span className="absolute top-2 right-2 rounded-full border border-kin/60 bg-bg/80 px-2 py-0.5 text-sm font-bold text-kin tabular-nums">
          {badge}
        </span>
      )}
      {lot && lot.zeni > 0 && (booster || card || mystery) && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-bg/80 px-2 py-0.5 text-xs font-bold text-kin">
          <ZeniCoin size={12} />
          {t("zeniBonus", { amount: lot.zeni })}
        </span>
      )}
    </div>
  );
}
