"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { BoardTier } from "@/lib/battle/tiers";
import type { LadderInfo } from "@/server/ranked/queries";
import { Sheet } from "../ui/Sheet";
import { RankEmblem } from "./RankEmblem";

/**
 * Fenêtre « i » du classé : tous les rangs avec leur emblème (comme la galerie de l'admin) et, sous
 * chacun, les PC de chaque division. Une seule rangée de 7 sur grand écran ; en dessous, une ligne
 * par rang (emblème à gauche). Le rang du joueur est entouré.
 */
export function RankLadderSheet({ ladder, current, onClose }: { ladder: LadderInfo; current: BoardTier; onClose: () => void }) {
  const t = useTranslations("ranked");

  const entry = (tier: BoardTier, lines: ReactNode) => (
    <li
      key={tier}
      className={`flex items-center gap-3 rounded-control p-2 text-sm lg:flex-col lg:gap-2 lg:px-1 lg:text-center ${tier === current ? "ring-2 ring-shu" : ""}`}
    >
      <RankEmblem tier={tier} division={tier === "GRAND_CHAMPION" ? null : 2} size={64} label={t(`tiers.${tier}`)} className="shrink-0" />
      <div className="flex min-w-0 flex-col gap-1 lg:items-center">
        <span className="font-bold">
          {t(`tiers.${tier}`)}
          {tier === current && <span className="sr-only"> · {t("ladder.current")}</span>}
        </span>
        {lines}
      </div>
    </li>
  );

  return (
    <Sheet open onClose={onClose} title={t("ladder.title")} wide="xl">
      <p className="text-sm text-text-muted">{t("ladder.intro", { top: ladder.grand.top, min: ladder.grand.min })}</p>
      <ul className="flex flex-col gap-1 rounded-card border border-border bg-[#15120f] p-2 text-washi-paper lg:grid lg:grid-cols-7 lg:gap-1.5 lg:p-2 xl:p-4">
        {ladder.tiers.map(({ tier, divisions }) =>
          entry(
            tier,
            <ul className="flex flex-col gap-0.5 text-xs tabular-nums text-[#a89f92] lg:text-[11px] xl:text-xs">
              {/* Du haut (I) vers le bas (III), comme on lit un classement */}
              {[...divisions].reverse().map((d) => (
                <li key={d.division}>
                  {d.max === null
                    ? t("ladder.rangeFrom", { division: t(`divisions.${d.division}`), min: d.min })
                    : t("ladder.range", { division: t(`divisions.${d.division}`), min: d.min, max: d.max })}
                </li>
              ))}
            </ul>,
          ),
        )}
        {entry(
          "GRAND_CHAMPION",
          <span className="text-xs tabular-nums text-[#a89f92] lg:text-[11px] xl:text-xs">{t("ladder.grand", { min: ladder.grand.min, top: ladder.grand.top })}</span>,
        )}
      </ul>
    </Sheet>
  );
}
