"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import type { RewardSummary } from "@/server/actions/economy";
import type { BoosterLook } from "@/server/economy/lot-view";

// Les deux scènes (Motion) ne sont chargées qu'au premier achat ; BuyButton précharge la célébration
const PurchaseCelebration = dynamic(() => import("./PurchaseCelebration").then((m) => m.PurchaseCelebration), { ssr: false });
const CardReveal = dynamic(() => import("../economy/CardReveal").then((m) => m.CardReveal), { ssr: false });

export type Celebration = {
  reward: RewardSummary;
  /** Solde après l'achat (réponse du serveur). */
  coins: number;
  /** Prix payé : celui affiché, que le serveur a revérifié (sinon STALE). */
  spent: number;
  look: BoosterLook | null;
  /** Nom du type de booster, pour « 5 boosters Shōnen ajoutés ». */
  name: string;
  openHref: string | null;
  /** Appelé à la fermeture : le bouton d'achat reprend le focus et affiche sa confirmation. */
  onClose?: () => void;
};

const StageContext = createContext<{ celebrate: (c: Celebration) => void }>({ celebrate: () => {} });

export function useShopStage() {
  return useContext(StageContext);
}

/**
 * Hôte unique des célébrations d'achat de la boutique. Elles vivent ici, au-dessus des cartes, et non
 * dans chaque bouton : le refresh() qui suit l'achat re-rend toute la page (vedette qui change à
 * minuit, carte épuisée), et la scène doit rester montée jusqu'au bout. Des boosters : la célébration ;
 * des cartes : la révélation des fuda, après la célébration pour un lot mixte.
 */
export function ShopStage({ children }: { children: ReactNode }) {
  const seq = useRef(0);
  const [current, setCurrent] = useState<(Celebration & { id: number }) | null>(null);
  const [reveal, setReveal] = useState<{ cards: OpenedCardView[]; onClose?: () => void } | null>(null);

  const celebrate = useCallback((c: Celebration) => {
    if (c.reward.boosters > 0 && c.look) setCurrent({ ...c, id: ++seq.current });
    else if (c.reward.cards.length > 0) setReveal({ cards: c.reward.cards, onClose: c.onClose });
    else c.onClose?.();
  }, []);
  const value = useMemo(() => ({ celebrate }), [celebrate]);

  const closeCelebration = () => {
    const done = current;
    setCurrent(null);
    if (done && done.reward.cards.length > 0) setReveal({ cards: done.reward.cards, onClose: done.onClose });
    else done?.onClose?.();
  };
  const closeReveal = () => {
    const done = reveal;
    setReveal(null);
    done?.onClose?.();
  };

  return (
    <StageContext.Provider value={value}>
      {children}
      {current && <PurchaseCelebration key={current.id} {...current} onClose={closeCelebration} />}
      {reveal && <CardReveal cards={reveal.cards} onClose={closeReveal} />}
    </StageContext.Provider>
  );
}
