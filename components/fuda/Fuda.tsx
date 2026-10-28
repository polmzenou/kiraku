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
import "./FudaFace.css";

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

// Cadre et papier par taille ; le contenu de la face suit la largeur réelle (container queries de FudaFace.css)
const layout: Record<FudaSize, { frame: string; inset: string; inner: string; sizes: string }> = {
  sm: {
    frame: "rounded-[7px]",
    inset: "inset-[3px]",
    inner: "rounded-[4px]",
    sizes: "(min-width: 1280px) 140px, (min-width: 1024px) 180px, (min-width: 768px) 25vw, 33vw",
  },
  md: {
    frame: "rounded-fuda",
    inset: "inset-1",
    inner: "rounded-[7px]",
    sizes: "(min-width: 768px) 240px, 50vw",
  },
  lg: {
    frame: "rounded-[14px]",
    inset: "inset-1.5",
    inner: "rounded-[9px]",
    sizes: "(min-width: 768px) 320px, 80vw",
  },
};

/** Sens du banc de nuées, stable pour un personnage (FNV-1a de son nom) : une grille ne se répète pas. */
function flipBank(name: string) {
  let h = 2166136261;
  for (const c of name) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  return (h >>> 0) % 2 === 1;
}

/** Colonnes du tanzaku : à partir de cinq signes, le nom japonais se coupe à son dernier séparateur. */
function tanzakuColumns(name: string) {
  if (name.length < 5) return [name];
  const at = Math.max(name.lastIndexOf("・"), name.lastIndexOf(" "), name.lastIndexOf("　"));
  return at > 0 && at < name.length - 1 ? [name.slice(0, at), name.slice(at + 1)] : [name];
}

/**
 * Carte (fuda) « Les Nuées d'or » : l'illustration couvre le papier 5:7 ; un banc de nuées dans la matière
 * de la rareté porte le shikishi (numéro, nom latin, série et stats 力 / 気), une nuée porte le sceau kanji et
 * un tanzaku le nom japonais vertical. `locked` affiche une silhouette sans jamais envoyer l'URL de l'image
 * au navigateur (fiches non découvertes, étape 3).
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
  corner,
  glow,
  describeImage = size !== "sm",
}: {
  card: FudaCard;
  series?: string;
  size?: FudaSize;
  /** En combat, les stats utilisent des libellés traduits et la rareté s'écrit sous le nom. */
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
  /** Pastilles à droite, juste au-dessus du numéro (×2, « Acquise »). */
  corner?: ReactNode;
  /** Anneau lumineux (meilleure carte du récap) : porté par la carte, il suit son inclinaison. */
  glow?: string;
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
    // Papier et encre réglés dans l'admin : le shikishi devient uni, dans ce papier
    ...(visual.paper && { "--kn-paper": visual.paper, "--kn-washi": visual.paper }),
    ...(visual.ink && { "--kn-ink": visual.ink, "--kn-muted": visual.ink, "--kn-kanji": visual.ink }),
    "--fx-color": visual.effectColor, "--fx-intensity": visual.intensity,
    "--fx-duration": `${8 / visual.speed}s`,
    ...(glow && { boxShadow: `0 0 0 2px ${glow}, 0 0 28px ${glow}` }),
  } as CSSProperties;
  const inBattle = variant === "battle";
  const native = !inBattle && !locked && card.nameNative ? tanzakuColumns(card.nameNative) : null;
  const longest = native ? Math.max(...native.map((part) => part.length)) : 0;
  const gilded = !locked && !monochrome && visual.artTone === "gold";
  const subtitle = (!locked && card.formName) || series || (inBattle ? rarity(card.rarity) : undefined);
  const flip = flipBank(card.name) ? " kn-flip" : "";

  const content = (
    <div className={`fuda relative isolate aspect-[5/7] w-full overflow-hidden ${l.frame}`} data-rarity={card.rarity} style={customStyle}>
      {/* Papier posé en absolu dans le cadre : sa hauteur ne dépend pas d'un pourcentage (WebKit la résolvait mal sous aspect-ratio) */}
      <div className={`fuda-paper absolute ${l.inset} overflow-hidden ${l.inner}`}>
        <div className="kn-art">
          {locked ? (
            <div className="kn-lock font-title text-sumi-muted/50">
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
          <span aria-hidden="true" className="kn-grain" />
        </div>

        {/* Banc de nuées dans la matière de la rareté : trait du contour et poudre d'or */}
        <span aria-hidden="true" className={`kn-bank${flip}`}>
          <i className="kn-ln" />
          <i className="kn-sn" />
        </span>
        {card.rarity === "AR" && <span aria-hidden="true" className={`kn-ar${flip}`} />}
        <span aria-hidden="true" className="kn-sc">
          <i className="kn-ln" />
          <span className="kn-seal font-seal">{visual.seal || definition?.seal || RARITY_SEAL[card.rarity]}</span>
        </span>
        {native && (
          <span lang="ja" className="kn-tz" style={longest > 7 ? ({ "--kn-tzl": longest } as CSSProperties) : undefined}>
            {native.map((part, i) => (
              <b key={i}>{part}</b>
            ))}
          </span>
        )}

        <div className="kn-shk">
          {card.rank === null ? (
            <span lang="ja" className="kn-no">
              {t("unnumbered")}
            </span>
          ) : (
            <span className="kn-no">{t("number", { number: cardNumber(card.rank) })}</span>
          )}
          <p className="kn-name font-title">{locked ? t("unknown") : card.name}</p>
          <p className="kn-l2">
            {subtitle && <span className="kn-sub">{subtitle}</span>}
            {!locked && (
              <span className="kn-st">
                <span>
                  <span className="sr-only">{t("power", { value: card.power })}</span>
                  <span aria-hidden="true">
                    <i className={inBattle ? undefined : "font-seal"}>{inBattle ? battle("attackShort") : "力"}</i>
                    {card.power}
                  </span>
                </span>
                <span>
                  <span className="sr-only">{t("ki", { value: card.ki })}</span>
                  <span aria-hidden="true">
                    <i className={inBattle ? undefined : "font-seal"}>{inBattle ? battle("defenseShort") : "気"}</i>
                    {card.ki}
                  </span>
                </span>
              </span>
            )}
          </p>
        </div>
        {corner && <span className="kn-corner">{corner}</span>}
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
