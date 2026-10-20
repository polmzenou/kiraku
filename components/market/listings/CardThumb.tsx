import Image from "next/image";
import type { CardView } from "@/lib/boosters/view";

/**
 * Vignette d'une carte (les cartes demandées d'une annonce, une notification) : l'illustration seule,
 * cerclée d'or quand le joueur peut la donner. Le nom est lu par les lecteurs d'écran.
 */
export function CardThumb({ card, highlight = false, dim = false, size = "md" }: { card: CardView; highlight?: boolean; dim?: boolean; size?: "sm" | "md" }) {
  return (
    <span
      className={`relative block aspect-[5/7] shrink-0 overflow-hidden rounded-[6px] border-2 bg-surface-2 ${size === "sm" ? "w-10" : "w-12 md:w-14"} ${
        highlight ? "border-kin shadow-raised" : "border-border"
      } ${dim ? "opacity-50" : ""}`}
    >
      <Image src={card.imageUrl} alt="" fill sizes="56px" className="object-cover object-top" draggable={false} />
      <span className="sr-only">{card.name}</span>
    </span>
  );
}
