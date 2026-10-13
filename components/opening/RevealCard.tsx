"use client";

import { m } from "motion/react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import type { OpenedCardView } from "@/lib/boosters/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { Fuda } from "../fuda/Fuda";
import { FudaTilt } from "../fuda/FudaTilt";

/** Halo du flash de révélation, selon la rareté (Épique et au-dessus). */
const FLASH: Partial<Record<Rarity, CSSProperties>> = {
  EPIC: { background: "radial-gradient(circle, rgb(150 110 200 / 0.9), transparent 70%)" },
  LEGENDARY: { background: "radial-gradient(circle, rgb(240 210 120 / 0.95), transparent 70%)" },
  MYTHIC: {
    background:
      "radial-gradient(circle, rgb(255 255 255 / 0.9), transparent 65%), conic-gradient(#ffd9ec, #c9f1ff, #e6ffd4, #fff1c4, #e2d4ff, #ffd9ec)",
  },
};

/** Sceau vermillon 新 tamponné, légèrement penché, sur une carte jamais obtenue. */
export function NewStamp({ delay = 0, animated = true }: { delay?: number; animated?: boolean }) {
  const t = useTranslations("opening");
  return (
    <m.span
      className="absolute -top-2 -right-2 z-20 flex size-9 items-center justify-center rounded-[4px] bg-shu-btn font-seal text-xl leading-none text-washi-paper shadow-paper"
      initial={animated ? { opacity: 0, scale: 1.8, rotate: -24 } : false}
      animate={{ opacity: 1, scale: 1, rotate: -12 }}
      transition={{ delay, duration: 0.25, ease: "easeOut" }}
    >
      <span aria-hidden="true" lang="ja">
        新
      </span>
      <span className="sr-only">{t("newCard")}</span>
    </m.span>
  );
}

/** Dos de fuda : papier washi et sceau 気楽. */
function CardBack() {
  return (
    <div className="tanzaku absolute inset-0 flex items-center justify-center rounded-[6px] border-4 border-shu-btn [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <span aria-hidden="true" lang="ja" className="font-seal text-4xl text-shu-btn [writing-mode:vertical-rl]">
        気楽
      </span>
    </div>
  );
}

type Props = { card: OpenedCardView; index: number; reduced: boolean; size: "sm" | "md" };

/** Une fuda qui sort du sachet, se retourne, puis flashe selon sa rareté. */
export function RevealCard({ card, index, reduced, size }: Props) {
  const start = index * 0.35;
  const flash = FLASH[card.rarity];

  if (reduced) {
    return (
      <m.div
        className="relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.15, duration: 0.3 }}
      >
        <Fuda card={card} series={card.series} size={size} />
        {card.isNew && <NewStamp animated={false} />}
      </m.div>
    );
  }

  return (
    <m.div
      className="relative [perspective:900px]"
      initial={{ opacity: 0, y: 70 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: start, duration: 0.35, ease: "easeOut" }}
    >
      {flash && (
        <m.span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-4 rounded-2xl"
          style={flash}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.95, 0], scale: [0.7, 1.1, 1.25] }}
          transition={{ delay: start + 0.7, duration: card.rarity === "EPIC" ? 0.7 : 1.1 }}
        />
      )}
      <m.div
        className="relative [transform-style:preserve-3d]"
        initial={{ rotateY: 180 }}
        animate={{ rotateY: 0 }}
        transition={{ delay: start + 0.3, duration: 0.5, ease: "easeOut" }}
      >
        <FudaTilt className="[backface-visibility:hidden]">
          <Fuda card={card} series={card.series} size={size} />
        </FudaTilt>
        <CardBack />
      </m.div>
      {card.isNew && <NewStamp delay={start + 0.85} />}
    </m.div>
  );
}
