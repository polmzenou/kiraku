"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import type { OpenedCardView } from "@/lib/boosters/view";
import { Fuda } from "../fuda/Fuda";
import { CardBack as FudaBack } from "../fuda/CardBack";
import { RarityFx } from "./RarityFx";
import { CardAura } from "./CardAura";
import { resolveAppearance } from "@/lib/catalog/appearance";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";

/** Étiquette vermillon tamponnée, légèrement penchée, sur une carte jamais obtenue. */
export function NewStamp({ delay = 0, animated = true }: { delay?: number; animated?: boolean }) {
  const t = useTranslations("opening");
  return (
    <m.span
      className="absolute -top-2 -right-2 z-40 inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-[4px] bg-shu-btn px-2 py-1 text-xs font-bold leading-none text-washi-paper"
      initial={animated ? { opacity: 0, scale: 2.2, rotate: -28 } : false}
      animate={{ opacity: 1, scale: 1, rotate: -12 }}
      transition={{ delay, type: "spring", stiffness: 520, damping: 18 }}
    >
      {t("newCard")}
    </m.span>
  );
}

/** Sceau doré 星 d'une carte vedette (bannière). */
export function FeaturedSeal({ delay = 0, animated = true }: { delay?: number; animated?: boolean }) {
  const t = useTranslations("opening");
  return (
    <m.span
      className="absolute -top-2 -left-2 z-40 flex h-7 items-center gap-1 rounded-full bg-kin px-2 text-[11px] font-bold text-sumi"
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

/** Face arrière du retournement, partagée avec les fiches collection et wiki. */
export function CardBack({ glow = false, static: still = false }: { glow?: boolean; static?: boolean }) {
  return (
    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <FudaBack glow={glow} static={still} />
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
  const definitions = useRarityDefinitions();
  const visual = resolveAppearance(definitions.find((r) => r.key === card.rarity)?.appearance, card.appearance);
  const front = phase === "front";
  const charging = phase === "charging";
  const rank = definitions.findIndex((r) => r.key === card.rarity);

  if (reduced) {
    return (
      <div className="relative isolate">
        <CardAura rarity={front ? card.rarity : undefined} reduced compact={compactFx} />
        {front ? (
          <m.div className="relative z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <Fuda card={card} series={card.series} size={size} tilt={false} />
          </m.div>
        ) : (
          <div className="relative z-10 aspect-[5/7] w-full [transform-style:preserve-3d] [transform:rotateY(180deg)]">
            <CardBack static />
          </div>
        )}
        {front && card.isNew && <NewStamp animated={false} />}
        {front && card.featured && <FeaturedSeal animated={false} />}
      </div>
    );
  }

  if (visual.reveal !== "flip") {
    return <div className="relative isolate">
      <CardAura rarity={front ? card.rarity : undefined} compact={compactFx} />
      {front ? <m.div className="relative z-10" initial={{ opacity: 0, scale: visual.reveal === "zoom" ? 0.6 : 1 }}
        animate={{ opacity: 1, scale: 1 }} transition={{ duration: visual.duration, delay: visual.delay, ease: visual.easing }}>
        <Fuda card={card} series={card.series} size={size} />
      </m.div> : <div className="relative aspect-[5/7] w-full [transform:rotateY(180deg)]"><CardBack static /></div>}
      {front && card.isNew && <NewStamp delay={visual.delay + visual.duration} />}
      {front && card.featured && <FeaturedSeal delay={visual.delay + visual.duration} />}
    </div>;
  }

  return (
    <div className="relative isolate [perspective:1100px]">
      <CardAura rarity={front ? card.rarity : undefined} compact={compactFx} />
      {front && <RarityFx rarity={card.rarity} compact={compactFx} />}
      <div className={charging && rank >= 3 ? "fx-tremble" : ""}>
        <m.div
          className="relative z-10 [transform-style:preserve-3d]"
          initial={false}
          animate={front ? { rotateY: 0, scale: [1.08, 1] } : { rotateY: 180, scale: charging ? 1.04 : 1 }}
          transition={front ? { duration: visual.duration, delay: visual.delay, ease: visual.easing } : { duration: 0.3 }}
        >
          <div aria-hidden={!front} inert={!front} className="[backface-visibility:hidden]">
            <Fuda card={card} series={card.series} size={size} />
          </div>
          <CardBack glow={charging && rank >= 4} static={front} />
        </m.div>
      </div>
      {front && card.isNew && <NewStamp delay={rank >= 3 ? 0.55 : 0.3} />}
      {front && card.featured && <FeaturedSeal delay={0.45} />}
    </div>
  );
}
