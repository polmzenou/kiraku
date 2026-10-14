"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import type { OpenedCardView } from "@/lib/boosters/view";
import { Fuda } from "../fuda/Fuda";
import { FudaTilt } from "../fuda/FudaTilt";
import { RarityFx } from "./RarityFx";

/** Sceau vermillon 新 tamponné, légèrement penché, sur une carte jamais obtenue. */
export function NewStamp({ delay = 0, animated = true }: { delay?: number; animated?: boolean }) {
  const t = useTranslations("opening");
  return (
    <m.span
      className="absolute -top-2 -right-2 z-40 flex size-9 items-center justify-center rounded-[4px] bg-shu-btn font-seal text-xl leading-none text-washi-paper shadow-paper"
      initial={animated ? { opacity: 0, scale: 2.2, rotate: -28 } : false}
      animate={{ opacity: 1, scale: 1, rotate: -12 }}
      transition={{ delay, type: "spring", stiffness: 520, damping: 18 }}
    >
      <span aria-hidden="true" lang="ja">
        新
      </span>
      <span className="sr-only">{t("newCard")}</span>
    </m.span>
  );
}

/** Sceau doré 星 d'une carte vedette (bannière). */
export function FeaturedSeal({ delay = 0, animated = true }: { delay?: number; animated?: boolean }) {
  const t = useTranslations("opening");
  return (
    <m.span
      className="absolute -top-2 -left-2 z-40 flex h-7 items-center gap-1 rounded-full bg-kin px-2 text-[11px] font-bold text-sumi shadow-paper"
      initial={animated ? { opacity: 0, scale: 1.8 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 420, damping: 20 }}
    >
      <span aria-hidden="true" lang="ja" className="font-seal">
        星
      </span>
      {t("featured")}
    </m.span>
  );
}

/** Dos de fuda : papier washi, liseré vermillon et sceau 気楽. `glow` : lueur dorée d'anticipation. */
export function CardBack({ glow = false }: { glow?: boolean }) {
  return (
    <div className="tanzaku absolute inset-0 flex items-center justify-center overflow-hidden rounded-[6px] border-4 border-shu-btn shadow-paper [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <span className="absolute inset-[6%] rounded-[3px] border border-shu-btn/40" aria-hidden="true" />
      <span aria-hidden="true" lang="ja" className="font-seal text-[2.2em] leading-none text-shu-btn [writing-mode:vertical-rl]">
        気楽
      </span>
      <span
        aria-hidden="true"
        className={`absolute inset-0 bg-[radial-gradient(circle,rgb(242_216_138/0.9),rgb(217_181_86/0.4)_50%,transparent_75%)] transition-opacity duration-500 ${
          glow ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

export type FlipPhase = "back" | "charging" | "front";

type Props = {
  card: OpenedCardView;
  phase: FlipPhase;
  size: "sm" | "md" | "lg";
  reduced: boolean;
  /** Effets réduits (grille de plusieurs boosters). */
  compactFx?: boolean;
};

/**
 * Une fuda face cachée qui se retourne. Avant le retournement (« charging »), une Épique+ frémit et
 * une Légendaire+ s'illumine d'or ; à l'endroit, l'effet de sa rareté se joue autour d'elle.
 */
export function FlipCard({ card, phase, size, reduced, compactFx = false }: Props) {
  const front = phase === "front";
  const charging = phase === "charging";
  const rank = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].indexOf(card.rarity);

  if (reduced) {
    return (
      <div className="relative">
        {front ? (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <Fuda card={card} series={card.series} size={size} />
          </m.div>
        ) : (
          <div className="relative aspect-[5/7] w-full [transform-style:preserve-3d] [transform:rotateY(180deg)]">
            <CardBack />
          </div>
        )}
        {front && card.isNew && <NewStamp animated={false} />}
        {front && card.featured && <FeaturedSeal animated={false} />}
      </div>
    );
  }

  return (
    <div className="relative [perspective:1100px]">
      {front && <RarityFx rarity={card.rarity} compact={compactFx} />}
      <div className={charging && rank >= 3 ? "fx-tremble" : ""}>
        <m.div
          className="relative z-10 [transform-style:preserve-3d]"
          initial={false}
          animate={front ? { rotateY: 0, scale: [1.08, 1] } : { rotateY: 180, scale: charging ? 1.04 : 1 }}
          transition={front ? { rotateY: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }, scale: { duration: 0.6 } } : { duration: 0.3 }}
        >
          <FudaTilt className="[backface-visibility:hidden]">
            <Fuda card={card} series={card.series} size={size} />
          </FudaTilt>
          <CardBack glow={charging && rank >= 4} />
        </m.div>
      </div>
      {front && card.isNew && <NewStamp delay={rank >= 3 ? 0.55 : 0.3} />}
      {front && card.featured && <FeaturedSeal delay={0.45} />}
    </div>
  );
}
