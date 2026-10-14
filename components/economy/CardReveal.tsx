"use client";

import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { OpenedCardView } from "@/lib/boosters/view";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import { CHARGE_MS, LEAK_COLOR } from "../opening/RarityFx";
import { FlipCard, type FlipPhase } from "../opening/RevealCard";
import { Button } from "../ui/Button";

/** Temps face cachée avant que la carte commence à frémir. */
const BACK_MS = 550;

/**
 * Révélation d'une carte achetée ou gagnée, comme au sortir d'un booster : l'écran s'éteint, la
 * fuda arrive face cachée au centre, frémit selon sa rareté puis se retourne. Plusieurs cartes :
 * une à la fois. Un <dialog> natif (focus piégé, Échap pour fermer).
 */
export function CardReveal({ cards, onClose }: { cards: OpenedCardView[]; onClose: () => void }) {
  const t = useTranslations("economy.reveal");
  const tRarity = useTranslations("rarity");
  const reduced = useReducedMotion() ?? false;
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<FlipPhase>("back");
  const card = cards[index];
  const last = index === cards.length - 1;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Face cachée → frémissement (selon la rareté) → retournement, pour chaque carte
  useEffect(() => {
    if (reduced) {
      const id = setTimeout(() => setPhase("front"), 150);
      return () => clearTimeout(id);
    }
    const charge = setTimeout(() => setPhase("charging"), BACK_MS);
    const flip = setTimeout(() => setPhase("front"), BACK_MS + CHARGE_MS[card.rarity]);
    return () => {
      clearTimeout(charge);
      clearTimeout(flip);
    };
  }, [index, card.rarity, reduced]);

  const next = () => {
    setPhase("back");
    setIndex((i) => i + 1);
  };
  const front = phase === "front";

  return (
    <dialog
      ref={dialog}
      aria-label={t("title")}
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-text backdrop:bg-black/85"
    >
      <LazyMotion features={domAnimation} strict>
        {/* Lumière de la rareté derrière la carte, une fois retournée */}
        <m.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 42%, ${LEAK_COLOR[card.rarity]} 0%, transparent 55%)` }}
          initial={false}
          animate={{ opacity: front ? 0.55 : 0.12 }}
          transition={{ duration: reduced ? 0 : 0.6 }}
        />

        <div className="relative flex h-full flex-col items-center justify-center gap-5 px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="text-sm font-bold tracking-wide text-washi-paper/80" aria-live="polite">
            {cards.length > 1 ? t("progress", { current: index + 1, total: cards.length }) : t("title")}
          </p>

          <m.div
            key={card.userCardId}
            className="w-[min(68vw,300px)]"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 80, scale: 0.8, rotate: -6 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 160, damping: 18 }}
          >
            <FlipCard card={card} phase={phase} size="lg" reduced={reduced} />
          </m.div>

          <m.div
            className="flex min-h-28 flex-col items-center gap-3 text-center"
            initial={false}
            animate={{ opacity: front ? 1 : 0, y: front ? 0 : 8 }}
            transition={{ duration: reduced ? 0 : 0.3, delay: front && !reduced ? 0.35 : 0 }}
            inert={!front}
          >
            <p className="flex items-center gap-2 text-washi-paper">
              <span aria-hidden="true" lang="ja" className="font-seal text-xl text-kin">
                {RARITY_SEAL[card.rarity]}
              </span>
              <span className="font-title text-xl font-bold">{card.name}</span>
            </p>
            <p className="text-sm text-washi-paper/70">
              {tRarity(card.rarity)}
              {card.isNew && ` · ${t("new")}`}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {last ? (
                <>
                  <Button type="button" variant="shu" onClick={() => dialog.current?.close()} autoFocus={front}>
                    {t("close")}
                  </Button>
                  <Link
                    href={`/collection/${card.anilistId}`}
                    className="inline-flex min-h-11 items-center px-3 text-sm text-washi-paper underline underline-offset-4"
                  >
                    {t("toCollection")}
                  </Link>
                </>
              ) : (
                <Button type="button" variant="shu" onClick={next}>
                  {t("next")}
                </Button>
              )}
            </div>
          </m.div>
        </div>
      </LazyMotion>
    </dialog>
  );
}
