"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { OpenedCardView } from "@/lib/boosters/view";
import { Fuda } from "../fuda/Fuda";
import { CardBack as FudaBack } from "../fuda/CardBack";
import { ArGhosts, chargeFor, GoldCracks, GoldShatter, RarityCardFx, RarityFx } from "./RarityFx";
import { CardAura } from "./CardAura";
import { resolveAppearance } from "@/lib/catalog/appearance";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { isTopTier } from "@/lib/catalog/tiers";

/**
 * Pastilles du coin haut-droit, empilées : « Nouveau » (jamais obtenue), puis « Souhait exaucé »
 * (la carte était dans la liste de souhaits). Sur une petite carte, le souhait se réduit au cœur.
 */
export function CardStamps({ card, delay = 0, animated = true, small = false }: {
  card: Pick<OpenedCardView, "isNew" | "wished">;
  delay?: number;
  animated?: boolean;
  small?: boolean;
}) {
  const t = useTranslations("opening");
  if (!card.isNew && !card.wished) return null;
  const stamp = (i: number) => ({
    initial: animated ? { opacity: 0, scale: 2.2, rotate: -28 } : false,
    animate: { opacity: 1, scale: 1, rotate: -12 },
    transition: { delay: delay + i * 0.18, type: "spring", stiffness: 520, damping: 18 },
  } as const);
  return (
    <span className="absolute -top-2 -right-2 z-40 flex flex-col items-end gap-1">
      {card.isNew && (
        <m.span
          className="inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-[4px] bg-shu-btn px-2 py-1 text-xs font-bold leading-none text-washi-paper"
          {...stamp(0)}
        >
          {t("newCard")}
        </m.span>
      )}
      {card.wished && (
        <m.span
          className="inline-flex min-h-7 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] bg-ai px-2 py-1 text-xs font-bold leading-none text-washi-paper"
          title={t("wishedCardLong")}
          {...stamp(card.isNew ? 1 : 0)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="currentColor">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
          {small ? <span className="sr-only">{t("wishedCardLong")}</span> : <span>{t("wishedCard")}</span>}
        </m.span>
      )}
    </span>
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
export function CardBack({ glow = false, static: still = false, premium = false }: { glow?: boolean; static?: boolean; premium?: boolean }) {
  return (
    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <FudaBack glow={glow} static={still} premium={premium} />
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
  // AR sort d'une faille (étirée depuis le centre), Gold brise son dos : pas de retournement
  const variant = card.rarity === "AR" || card.rarity === "GOLD" ? card.rarity : null;
  // Dos premium : la grosse carte se trahit en arrivant en haut de la pile
  const premium = isTopTier(card.rarity, definitions);

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
            <CardBack static premium={premium} />
          </div>
        )}
        {front && <CardStamps card={card} animated={false} />}
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
      </m.div> : <div className="relative aspect-[5/7] w-full [transform:rotateY(180deg)]"><CardBack static premium={premium} /></div>}
      {front && <CardStamps card={card} delay={visual.delay + visual.duration} />}
      {front && card.featured && <FeaturedSeal delay={visual.delay + visual.duration} />}
    </div>;
  }

  return (
    <div className="relative isolate [perspective:1100px]">
      <CardAura rarity={front ? card.rarity : undefined} compact={compactFx} />
      {front && <RarityFx rarity={card.rarity} compact={compactFx} />}
      <div className={`relative ${charging && rank >= 3 ? "fx-tremble" : ""}`}>
        <m.div
          className="relative z-10 [transform-style:preserve-3d]"
          initial={false}
          animate={
            !front
              ? { rotateY: 180, scale: charging ? 1.04 : 1 }
              : variant === "AR"
                ? { rotateY: 0, scaleX: [0.04, 1], scale: 1 }
                : { rotateY: 0, scale: [1.08, 1] }
          }
          transition={
            !front
              ? { duration: 0.3 }
              : variant
                ? { rotateY: { duration: 0 }, scaleX: { duration: 0.55, delay: 0.12, ease: [0.2, 0.9, 0.3, 1.15] }, scale: { duration: 0.5, ease: visual.easing } }
                : { duration: visual.duration, delay: visual.delay, ease: visual.easing }
          }
        >
          <div aria-hidden={!front} inert={!front} className="[backface-visibility:hidden]">
            <Fuda card={card} series={card.series} size={size} overlay={front && <RarityCardFx rarity={card.rarity} />} />
          </div>
          <CardBack glow={charging && rank >= 4} static={front} premium={premium} />
        </m.div>
        {charging && card.rarity === "GOLD" && <GoldCracks duration={chargeFor(card.rarity, definitions)} />}
        {front && variant === "GOLD" && <GoldShatter><FudaBack flat premium={premium} /></GoldShatter>}
        {/* Fantômes AR : l'image seule (déjà chargée), pas trois cartes complètes ; rien en effets allégés */}
        {front && variant === "AR" && !compactFx && <ArGhosts><GhostArt card={card} /></ArGhosts>}
      </div>
      {front && <CardStamps card={card} delay={rank >= 3 ? 0.55 : 0.3} />}
      {front && card.featured && <FeaturedSeal delay={0.45} />}
    </div>
  );
}

/** Copie fantôme d'une AR : cadre et image de la carte, sans texte, effets ni inclinaison. */
function GhostArt({ card }: { card: OpenedCardView }) {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-[14px] bg-[var(--fuda-frame,#6f8fd8)]">
      <span className="absolute inset-1.5 overflow-hidden rounded-[9px]">
        <Image src={card.imageUrl} alt="" fill sizes="(min-width: 768px) 320px, 80vw" draggable={false} className="object-cover object-top" />
      </span>
    </span>
  );
}
