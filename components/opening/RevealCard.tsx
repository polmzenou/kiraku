"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import { Fuda } from "../fuda/Fuda";
import { CardBack as FudaBack } from "../fuda/CardBack";
import { ArGhosts, chargeFor, GoldCracks, GoldShatter, RarityCardFx, RarityFx } from "./RarityFx";
import { CardAura } from "./CardAura";
import { RevealScene, XR_ECHOES, type SceneBox } from "./RevealScene";
import { resolveAppearance } from "@/lib/catalog/appearance";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import { isTopTier } from "@/lib/catalog/tiers";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import { REVEAL_SCENES, revealSceneKey } from "@/lib/opening/reveal-scenes";
import type { FudaCopy } from "../fuda/Fuda";

// Révélation d'une gravée à la baren : chargée seulement quand une carte sort gravée
const BarenReveal = dynamic(() => import("./BarenReveal").then((mod) => mod.BarenReveal), { ssr: false });

/** La carte avant sa gravure : l'édition est retirée, l'héritage reste. */
function uninked(copy: FudaCopy | null | undefined): FudaCopy | null {
  return copy && copy.heritage > 0 ? { heritage: copy.heritage } : null;
}

/**
 * Pastilles du coin haut-droit, empilées : « Gravée » (édition numérotée, prestige), « Nouveau » (jamais obtenue) ou
 * « Retrouvée », puis « Souhait exaucé » (la carte était dans la liste de souhaits). Sur une petite carte, le souhait
 * se réduit au cœur et la gravée à son sceau.
 */
export function CardStamps({ card, delay = 0, animated = true, small = false }: {
  card: Pick<OpenedCardView, "isNew" | "wished" | "regained" | "copy">;
  delay?: number;
  animated?: boolean;
  small?: boolean;
}) {
  const t = useTranslations("opening");
  const engraved = card.copy?.printing != null && card.copy.serial != null;
  if (!card.isNew && !card.regained && !card.wished && !engraved) return null;
  const before = engraved ? 1 : 0;
  const stamp = (i: number) => ({
    initial: animated ? { opacity: 0, scale: 2.2, rotate: -28 } : false,
    animate: { opacity: 1, scale: 1, rotate: -12 },
    transition: { delay: delay + i * 0.18, type: "spring", stiffness: 520, damping: 18 },
  } as const);
  return (
    <span className="absolute -top-2 -right-2 z-40 flex flex-col items-end gap-1">
      {engraved && (
        <m.span
          className="inline-flex min-h-7 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] bg-sumi px-2 py-1 text-xs font-bold leading-none text-washi-paper shadow-[inset_0_0_0_1px_var(--color-kin)]"
          title={t("engravedCardLong", { serial: card.copy!.serial! })}
          {...stamp(0)}
        >
          <span aria-hidden="true" lang="ja" className="font-seal text-shu">{card.copy!.seal ?? "版"}</span>
          {small ? <span className="sr-only">{t("engravedCardLong", { serial: card.copy!.serial! })}</span> : <span>{t("engravedCard", { serial: card.copy!.serial! })}</span>}
        </m.span>
      )}
      {card.isNew && (
        <m.span
          className="inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-[4px] bg-shu-btn px-2 py-1 text-xs font-bold leading-none text-washi-paper"
          {...stamp(before)}
        >
          {t("newCard")}
        </m.span>
      )}
      {card.regained && !card.isNew && (
        <m.span
          className="inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-[4px] bg-kin px-2 py-1 text-xs font-bold leading-none text-sumi"
          {...stamp(before)}
        >
          {t("regainedCard")}
        </m.span>
      )}
      {card.wished && (
        <m.span
          className="inline-flex min-h-7 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] bg-ai px-2 py-1 text-xs font-bold leading-none text-washi-paper"
          title={t("wishedCardLong")}
          {...stamp(before + (card.isNew || card.regained ? 1 : 0))}
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
  /** Dans la pile du rituel : les raretés visuelles jouent leur révélation plein écran. */
  scene?: boolean;
  /** Tirage d'un booster : une carte sortie gravée reçoit sa gravure à la baren (ailleurs, elle est déjà gravée). */
  engraving?: boolean;
};

/** Liseré d'argent de la Black, porté par la carte : il suit son inclinaison. */
const BR_RIM = "rgb(209 205 204 / 0.5)";

/**
 * Une fuda face cachée qui se retourne. Avant le retournement (« charging »), une Épique+ frémit et
 * une Légendaire+ s'illumine d'or ; à l'endroit, l'effet de sa rareté se joue autour d'elle.
 */
export function FlipCard({ card, phase, size, reduced, compactFx = false, scene = false, engraving = false }: Props) {
  const definitions = useRarityDefinitions();
  const root = useRef<HTMLDivElement>(null);
  const definition = definitions.find((r) => r.key === card.rarity);
  const visual = resolveAppearance(definition?.appearance, card.appearance);
  const front = phase === "front";
  const charging = phase === "charging";
  const rank = definitions.findIndex((r) => r.key === card.rarity);
  // AR sort d'une faille (étirée depuis le centre), Gold brise son dos : pas de retournement
  const variant = card.rarity === "AR" || card.rarity === "GOLD" ? card.rarity : null;
  // Dos premium : la grosse carte se trahit en arrivant en haut de la pile
  const premium = isTopTier(card.rarity, definitions);
  const sceneKey = scene && !reduced ? revealSceneKey(card.rarity, visual.reveal) : null;
  const sceneOn = sceneKey !== null && phase !== "back";
  // Gravée tirée : après le grand moment de la rareté, la baren frotte la carte, qui reçoit alors son édition
  const baren = engraving && !reduced && card.copy?.printing != null && card.copy.serial != null;
  const [inked, setInked] = useState(false);
  const [barenDone, setBarenDone] = useState(false);
  const shown = baren && !inked ? { ...card, copy: uninked(card.copy) } : card;
  const barenDelay = sceneKey !== null
    ? REVEAL_SCENES[sceneKey].total - REVEAL_SCENES[sceneKey].charge
    : visual.reveal !== "flip" ? Math.round((visual.delay + visual.duration) * 1000) + 400 : rank >= 5 ? 1300 : rank >= 3 ? 1100 : 700;
  const barenLayer = front && baren && !barenDone && (
    <BarenReveal copy={card.copy!} delay={barenDelay} onInked={() => setInked(true)} onDone={() => setBarenDone(true)} />
  );
  // Les calques plein écran se calent sur la carte : mesurée avant de peindre le début de la charge
  const [sceneBox, setSceneBox] = useState<SceneBox | null>(null);
  useLayoutEffect(() => {
    if (!sceneOn) return;
    const rect = root.current?.getBoundingClientRect();
    if (rect) setSceneBox({ cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, cw: rect.width, ch: rect.height });
  }, [sceneOn]);

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
        <Fuda card={shown} series={card.series} size={size} />
      </m.div> : <div className="relative aspect-[5/7] w-full [transform:rotateY(180deg)]"><CardBack static premium={premium} /></div>}
      {barenLayer}
      {front && <CardStamps card={shown} delay={visual.delay + visual.duration} />}
      {front && card.featured && <FeaturedSeal delay={visual.delay + visual.duration} />}
    </div>;
  }

  return (
    <div ref={root} className={`relative isolate [perspective:1100px] ${sceneOn && sceneKey === "XR" ? "rv-xr-shake" : ""}`}>
      {!sceneOn && <CardAura rarity={front ? card.rarity : undefined} compact={compactFx} />}
      {front && sceneKey === null && <RarityFx rarity={card.rarity} compact={compactFx} />}
      {sceneOn && sceneBox && <RevealScene scene={sceneKey} box={sceneBox} lite={compactFx} seal={definition?.seal ?? RARITY_SEAL[card.rarity] ?? ""} />}
      {/* Échos colorés de la carte qui fonce dans le tunnel de la XR */}
      {sceneOn && sceneKey === "XR" && !compactFx && XR_ECHOES.map((tint, i) => (
        <span key={tint} aria-hidden="true" className="rv-xr-echo" style={{ "--tint": tint, "--d": `${1450 + (i + 1) * 75}ms` } as CSSProperties}>
          <GhostArt card={card} />
        </span>
      ))}
      <div className={`relative ${sceneOn ? `rv-card-${sceneKey}` : charging && rank >= 3 ? "fx-tremble" : ""}`} data-front={front || undefined}>
        <m.div
          className={`relative z-10 [transform-style:preserve-3d] ${sceneKey === "XR" && front ? "rv-flip-XR" : ""}`}
          initial={false}
          animate={
            sceneOn
              ? { rotateY: front ? 0 : sceneKey === "XR" ? [180, 180, 0] : 180, scale: 1 }
              : !front
                ? { rotateY: 180, scale: charging ? 1.04 : 1 }
                : variant === "AR"
                  ? { rotateY: 0, scaleX: [0.04, 1], scale: 1 }
                  : { rotateY: 0, scale: [1.08, 1] }
          }
          transition={
            sceneOn
              ? front
                ? REVEAL_SCENES[sceneKey].flip
                // La XR se retourne au fond du tunnel, avant de foncer vers l'écran
                : sceneKey === "XR" ? { rotateY: { duration: 1.45, times: [0, 0.995, 1], ease: "linear" }, scale: { duration: 0 } } : { duration: 0.3 }
              : !front
                ? { duration: 0.3 }
                : variant
                  ? { rotateY: { duration: 0 }, scaleX: { duration: 0.55, delay: 0.12, ease: [0.2, 0.9, 0.3, 1.15] }, scale: { duration: 0.5, ease: visual.easing } }
                  : { duration: visual.duration, delay: visual.delay, ease: visual.easing }
          }
        >
          <div aria-hidden={!front} inert={!front} className="[backface-visibility:hidden]">
            <Fuda
              card={shown}
              series={card.series}
              size={size}
              glow={front && sceneKey === "BR" ? BR_RIM : undefined}
              overlay={front && (sceneKey === "XR" ? <span aria-hidden="true" className="rv-xr-foil"><i /></span> : <RarityCardFx rarity={card.rarity} />)}
            />
          </div>
          <CardBack glow={charging && rank >= 4 && !sceneOn} static={front} premium={premium} />
        </m.div>
        {charging && card.rarity === "GOLD" && <GoldCracks duration={chargeFor(card.rarity, definitions)} />}
        {front && variant === "GOLD" && <GoldShatter><FudaBack flat premium={premium} /></GoldShatter>}
        {/* Fantômes AR : l'image seule (déjà chargée), pas trois cartes complètes ; rien en effets allégés */}
        {front && variant === "AR" && !compactFx && <ArGhosts><GhostArt card={card} /></ArGhosts>}
      </div>
      {barenLayer}
      {front && <CardStamps card={shown} delay={rank >= 3 ? 0.55 : 0.3} />}
      {front && card.featured && <FeaturedSeal delay={0.45} />}
    </div>
  );
}

/** Copie fantôme d'une AR : cadre et image de la carte, sans texte, effets ni inclinaison. */
function GhostArt({ card }: { card: OpenedCardView }) {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-[14px] bg-[var(--fuda-frame,#f08ab0)]">
      <span className="absolute inset-1.5 overflow-hidden rounded-[9px]">
        <Image src={card.imageUrl} alt="" fill sizes="(min-width: 768px) 320px, 80vw" draggable={false} className="object-cover object-top" data-spoiler={card.spoiler || undefined} />
      </span>
    </span>
  );
}
