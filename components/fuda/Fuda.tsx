import { useTranslations } from "next-intl";
import Image from "next/image";
import { cardNumber } from "@/lib/catalog/display";
import { RARITIES, RARITY_SEAL, type Rarity } from "@/lib/catalog/rarity";

export type FudaCard = {
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
};

type FudaSize = "sm" | "md" | "lg";

const layout: Record<FudaSize, { frame: string; seal: string; number: string; name: string; meta: string; sizes: string }> = {
  sm: {
    frame: "p-[3px] rounded-[5px]",
    seal: "size-5 text-[13px]",
    number: "text-[9px] px-1",
    name: "text-[11px] leading-tight",
    meta: "hidden",
    sizes: "(min-width: 1280px) 140px, (min-width: 1024px) 180px, (min-width: 768px) 25vw, 33vw",
  },
  md: {
    frame: "p-1 rounded-[6px]",
    seal: "size-7 text-lg",
    number: "text-[10px] px-1.5",
    name: "text-sm leading-tight",
    meta: "text-[11px]",
    sizes: "(min-width: 768px) 240px, 50vw",
  },
  lg: {
    frame: "p-1.5 rounded-[8px]",
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
  locked = false,
  preload = false,
}: {
  card: FudaCard;
  series?: string;
  size?: FudaSize;
  locked?: boolean;
  preload?: boolean;
}) {
  const t = useTranslations("fuda");
  const l = layout[size];
  const showNative = size !== "sm" && !locked && card.nameNative;

  return (
    <div className={`fuda relative isolate aspect-[5/7] w-full overflow-hidden shadow-paper ${l.frame}`} data-rarity={card.rarity}>
      <div className="flex h-full flex-col overflow-hidden rounded-[3px] bg-washi-paper text-sumi">
        <div className="relative flex-1 overflow-hidden bg-[#e4d9c4]">
          {locked ? (
            <div className="flex h-full items-center justify-center font-title text-5xl text-sumi-muted/50">
              <span aria-hidden="true">?</span>
              <span className="sr-only">{t("locked")}</span>
            </div>
          ) : (
            <Image
              src={card.imageUrl}
              alt={size === "sm" ? "" : t("imageAlt", { name: card.name })}
              fill
              sizes={l.sizes}
              preload={preload}
              draggable={false}
              className="object-cover object-top"
            />
          )}

          <span
            aria-hidden="true"
            className={`absolute left-1 top-1 flex items-center justify-center rounded-[3px] font-seal leading-none text-washi-paper ${l.seal}`}
            style={{ background: "var(--fuda-frame)" }}
          >
            {RARITY_SEAL[card.rarity]}
          </span>
          <span className={`absolute right-1 top-1 rounded-[3px] bg-washi-paper/85 font-medium ${l.number}`}>
            {t("number", { number: cardNumber(card.rank) })}
          </span>
          {showNative && (
            <span
              lang="ja"
              className="absolute bottom-1 right-1 max-h-[70%] overflow-hidden rounded-[3px] bg-washi-paper/85 px-0.5 py-1 font-title font-bold [writing-mode:vertical-rl]"
            >
              {card.nameNative}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-0.5 px-1.5 py-1">
          <p className={`truncate font-title font-bold ${l.name}`}>{locked ? t("unknown") : card.name}</p>
          <div className={`${l.meta} flex items-center justify-between gap-2 text-sumi-muted`}>
            {series && <span className="truncate">{series}</span>}
            {!locked && (
              <span className="flex shrink-0 gap-2 font-medium text-sumi">
                <span>
                  <span className="sr-only">{t("power", { value: card.power })}</span>
                  <span aria-hidden="true">
                    <span className="font-seal">力</span> {card.power}
                  </span>
                </span>
                <span>
                  <span className="sr-only">{t("ki", { value: card.ki })}</span>
                  <span aria-hidden="true">
                    <span className="font-seal">気</span> {card.ki}
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Effet de matière (laque, or, nacre) au-dessus de la carte, à partir d'Épique */}
      {!locked && RARITIES.indexOf(card.rarity) >= RARITIES.indexOf("EPIC") && (
        <span aria-hidden="true" className="fuda-sheen" />
      )}
    </div>
  );
}
