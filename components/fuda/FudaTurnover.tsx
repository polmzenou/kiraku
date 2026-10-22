"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Rarity } from "@/lib/catalog/rarity";
import { isTopTier } from "@/lib/catalog/tiers";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { CardBack } from "./CardBack";
import "./FudaTurnover.css";

/** Même dos que l'ouverture (premium selon `rarity`) ; les fiches gardent leur recto et leur contenu serveur. */
export function FudaTurnover({ children, rarity, className = "" }: { children: ReactNode; rarity?: Rarity; className?: string }) {
  const t = useTranslations("cardBack");
  const definitions = useRarityDefinitions();
  const premium = rarity !== undefined && isTopTier(rarity, definitions);
  const [back, setBack] = useState(false);
  return (
    <div className={className}>
      <div className="kf-scene">
        <div className="kf-turn" data-back={back}>
          <div className="kf-front" aria-hidden={back} inert={back}>
            {children}
          </div>
          <div className="kf-reverse" aria-hidden={!back} inert={!back}>
            <CardBack static={!back} premium={premium} />
            <span className="sr-only">{t("description")}</span>
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setBack(!back)} aria-pressed={back} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-border bg-surface px-3 text-sm text-text hover:border-kin">
        <span aria-hidden="true">↻</span>{back ? t("showFront") : t("showBack")}
      </button>
    </div>
  );
}
