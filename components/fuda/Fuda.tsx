import { useTranslations } from "next-intl";
import Image from "next/image";
import { cardNumber } from "@/lib/catalog/display";
import { BASE_RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";
import { fxTier } from "@/lib/catalog/tiers";
import { FudaTilt } from "./FudaTilt";
import type { CSSProperties, ReactNode } from "react";
import { resolveAppearance } from "@/lib/catalog/appearance";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import "./FudaEffects.css";

export type FudaCard = {
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  appearance?: unknown;
  /** Nom de la forme d'une variante (« Gear 5 ») : remplace la série sur la ligne du bas. */
  formName?: string | null;
};

type FudaSize = "sm" | "md" | "lg";

const layout: Record<FudaSize, { frame: string; inset: string; inner: string; seal: string; number: string; name: string; meta: string; sizes: string }> = {
  sm: {
    frame: "rounded-[7px]",
    inset: "inset-[3px]",
    inner: "rounded-[4px]",
    seal: "size-5 text-[13px]",
    number: "text-[9px] px-1",
    name: "text-[11px] leading-tight",
    meta: "hidden",
    sizes: "(min-width: 1280px) 140px, (min-width: 1024px) 180px, (min-width: 768px) 25vw, 33vw",
  },
  md: {
    frame: "rounded-fuda",
    inset: "inset-1",
    inner: "rounded-[7px]",
    seal: "size-7 text-lg",
    number: "text-[10px] px-1.5",
    name: "text-sm leading-tight",
    meta: "text-[11px]",
    sizes: "(min-width: 768px) 240px, 50vw",
  },
  lg: {
    frame: "rounded-[14px]",
    inset: "inset-1.5",
    inner: "rounded-[9px]",
    seal: "size-10 text-[26px]",
    number: "text-xs px-2 py-0.5",
    name: "text-xl leading-snug",
    meta: "text-sm",
    sizes: "(min-width: 768px) 320px, 80vw",
  },
};

/**
 * Carte (fuda) : papier 5:7, cadre dans la matière de la rareté, sceau kanji, numéro, nom japonais
 * vertical, nom latin, série et stats 力 / 気. `locked` affiche une silhouette sans jamais
 * envoyer l'URL de l'image au navigateur (fiches non découvertes, étape 3).
 */
export function Fuda({
  card,
  series,
  size = "md",
  variant = "default",
  locked = false,
  monochrome = false,
  preload = false,
  tilt = true,
  still = false,
  sizes,
  overlay,
  describeImage = size !== "sm",
}: {
  card: FudaCard;
  series?: string;
  size?: FudaSize;
  /** En combat, les sceaux et stats utilisent des libellés traduits. */
  variant?: "default" | "battle";
  locked?: boolean;
  monochrome?: boolean;
  preload?: boolean;
  /** Désactivé pendant le glisser-déposer ou pour un préchargement invisible. */
  tilt?: boolean;
  /**
   * Carte figée (emplacements de la pile, grilles du récap) : ni inclinaison, ni reflets animés,
   * aucun écouteur. Les petites cartes nombreuses ne coûtent ainsi plus rien pendant les animations.
   */
  still?: boolean;
  sizes?: string;
  /** Posé sur la carte (pastilles, reflets de révélation) : il s'incline avec elle. */
  overlay?: ReactNode;
  /**
   * Texte alternatif « nom du personnage ». Vide par défaut en petite taille (le nom est déjà lu par
   * le lien parent) ; à activer quand la carte est dans un lien étiqueté ou masqué (`aria-hidden`),
   * pour la recherche d'images sans double lecture.
   */
  describeImage?: boolean;
}) {
  const t = useTranslations("fuda");
  const rarity = useTranslations("rarity");
  const battle = useTranslations("battle.board");
  const l = layout[size];
  const definitions = useRarityDefinitions();
  const definition = definitions.find((r) => r.key === card.rarity);
  const tier = BASE_RARITIES.indexOf(fxTier(card.rarity, definitions));
  const visual = resolveAppearance(definition?.appearance, card.appearance);
  const customStyle = {
    ...(visual.frame && { "--fuda-frame": visual.frame, "--fuda-frame-bg": visual.frame }),
    "--fx-color": visual.effectColor, "--fx-intensity": visual.intensity,
    "--fx-duration": `${8 / visual.speed}s`,
  } as CSSProperties;
  const inBattle = variant === "battle";
  const showNative = !inBattle && size !== "sm" && !locked && card.nameNative;
  const gilded = !locked && !monochrome && visual.artTone === "gold";
  const subtitle = (!locked && card.formName) || series;

  const content = (
    <div className={`fuda relative isolate aspect-[5/7] w-full overflow-hidden ${l.frame}`} data-rarity={card.rarity} style={customStyle}>
      {/* Papier posé en absolu dans le cadre : sa hauteur ne dépend pas d'un pourcentage (WebKit la résolvait mal sous aspect-ratio) */}
      <div className={`fuda-paper absolute ${l.inset} flex flex-col overflow-hidden bg-washi-paper text-sumi ${l.inner}`} style={{ backgroundColor: visual.paper, color: visual.ink }}>
        <div className="relative flex-1 overflow-hidden bg-[#e4d9c4]">
          {locked ? (
            <div className="flex h-full items-center justify-center font-title text-5xl text-sumi-muted/50">
              <span aria-hidden="true">?</span>
              <span className="sr-only">{t("locked")}</span>
            </div>
          ) : (
            <Image
              src={card.imageUrl}
              alt={describeImage ? t("imageAlt", { name: card.name }) : ""}
              fill
              sizes={sizes ?? l.sizes}
              preload={preload}
              draggable={false}
              className={`object-cover object-top${monochrome ? " grayscale" : ""}${gilded ? " fuda-art-gold" : ""}`}
              style={{ objectPosition: `${visual.focalX}% ${visual.focalY}%`, transform: `scale(${visual.zoom})`, transformOrigin: `${visual.focalX}% ${visual.focalY}%` }}
            />
          )}
          {gilded && <span aria-hidden="true" className="fuda-gilt" />}

          <span
            aria-hidden="true"
            className={`absolute left-1 flex items-center justify-center rounded-[5px] text-washi-paper shadow-sheen ${inBattle ? "bottom-1 max-w-[calc(100%-0.5rem)] px-1 py-0.5 text-[9px] font-bold leading-tight" : `top-1 font-seal leading-none ${l.seal}`}`}
            style={{ background: "var(--fuda-frame)" }}
          >
            {inBattle ? rarity(card.rarity) : visual.seal || definition?.seal || RARITY_SEAL[card.rarity]}
          </span>
          <span className={`absolute right-1 top-1 rounded-pill bg-washi-paper/85 font-medium ${l.number}`}>
            {t("number", { number: cardNumber(card.rank) })}
          </span>
          {showNative && (
            <span
              lang="ja"
              className="absolute bottom-1 right-1 max-h-[70%] overflow-hidden rounded-pill bg-washi-paper/85 px-0.5 py-1 font-title font-bold [writing-mode:vertical-rl]"
            >
              {card.nameNative}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 px-1.5 py-1">
          <p className={`truncate font-title font-bold ${l.name}`}>{locked ? t("unknown") : card.name}</p>
          <div className={`${l.meta} flex items-center justify-between gap-2 text-sumi-muted`} style={{ color: visual.ink }}>
            {subtitle && <span className="truncate">{subtitle}</span>}
            {!locked && (
              <span className="flex shrink-0 gap-2 font-medium text-sumi" style={{ color: visual.ink }}>
                <span>
                  <span className="sr-only">{t("power", { value: card.power })}</span>
                  <span aria-hidden="true">
                    <span className={inBattle ? undefined : "font-seal"}>{inBattle ? battle("attackShort") : "力"}</span> {card.power}
                  </span>
                </span>
                <span>
                  <span className="sr-only">{t("ki", { value: card.ki })}</span>
                  <span aria-hidden="true">
                    <span className={inBattle ? undefined : "font-seal"}>{inBattle ? battle("defenseShort") : "気"}</span> {card.ki}
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Effet de matière (laque, or, nacre) au-dessus de la carte, à partir d'Épique */}
      {!locked && !monochrome && visual.effects === undefined && tier >= BASE_RARITIES.indexOf("EPIC") && (
        <span aria-hidden="true" className="fuda-sheen" />
      )}
      {!locked && !monochrome && visual.effects?.map((effect) => <span key={effect} aria-hidden="true" className={`fuda-effect fuda-effect-${effect}`} />)}
      {overlay && <div className="pointer-events-none absolute inset-0 z-30">{overlay}</div>}
    </div>
  );

  if (still) return content;
  return tilt || visual.effects?.length ? <FudaTilt rotate={tilt && visual.tilt > 0} angle={visual.tilt} reactive={visual.reactive}>{content}</FudaTilt> : content;
}
