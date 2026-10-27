import Image from "next/image";
import { resolveAppearance } from "@/lib/catalog/appearance";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import type { CardView } from "@/lib/boosters/view";
import "../../fuda/FudaEffects.css";

/**
 * Vignette d'une carte (les cartes demandées d'une annonce, une notification) : l'illustration seule,
 * avec le ton et le cadrage de sa rareté (artwork doré des Gold), cerclée d'or quand le joueur peut
 * la donner. Le nom est lu par les lecteurs d'écran.
 */
export function CardThumb({ card, highlight = false, dim = false, size = "md" }: { card: CardView; highlight?: boolean; dim?: boolean; size?: "sm" | "md" }) {
  const definition = useRarityDefinitions().find((r) => r.key === card.rarity);
  const visual = resolveAppearance(definition?.appearance, card.appearance);
  const gilded = visual.artTone === "gold";
  return (
    <span
      className={`relative block aspect-[5/7] shrink-0 overflow-hidden rounded-[6px] border-2 bg-surface-2 ${size === "sm" ? "w-10" : "w-12 md:w-14"} ${
        highlight ? "border-kin shadow-raised" : "border-border"
      } ${dim ? "opacity-50" : ""}`}
    >
      <Image
        src={card.imageUrl}
        alt=""
        fill
        sizes="56px"
        className={`object-cover object-top${gilded ? " fuda-art-gold" : ""}`}
        style={{ objectPosition: `${visual.focalX}% ${visual.focalY}%`, transform: `scale(${visual.zoom})`, transformOrigin: `${visual.focalX}% ${visual.focalY}%` }}
        draggable={false}
      />
      {gilded && <span aria-hidden="true" className="fuda-gilt" />}
      <span className="sr-only">{card.name}</span>
    </span>
  );
}
