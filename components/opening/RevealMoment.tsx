"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { rarityColor } from "@/lib/catalog/appearance";
import type { Rarity } from "@/lib/catalog/rarity";
import { isBigMoment } from "@/lib/catalog/tiers";
import { useRarityDefinitions } from "@/lib/catalog/use-rarities";
import "./RevealFx.css";

// Grand moment des Légendaires et au-delà : le sceau de la rareté s'écrase en plein écran, son nom
// s'inscrit en capitales au-dessus de la carte puis s'envole, et le fond du rituel prend sa teinte.

export type Moment = { id: string; rarity: Rarity; color: string; seal: string; name: string };

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/** Apparition du nom : le sceau, puis une lettre toutes les 45 ms. */
const SEAL_IN = 0.85;
const LETTERS_IN = 0.95;
const LETTER_STEP = 0.045;
const LETTER_DURATION = 0.45;
/** Le nom reste entier à l'écran pendant ce temps (s), puis s'envole. */
const TITLE_HOLD = 2;
const OUT_STEP = 0.03;
const OUT_DURATION = 0.5;

/** Le nom est parti (s) : le compteur de cartes peut revenir à sa place. */
export const titleGone = (name: string) => {
  const n = Array.from(name).length;
  return titleOut(n) + (n - 1) * OUT_STEP + OUT_DURATION;
};
const titleOut = (letters: number) => LETTERS_IN + (letters - 1) * LETTER_STEP + LETTER_DURATION + TITLE_HOLD;

/** Délai d'apparition de la teinte : quand le sceau s'est posé. */
export const TINT_DELAY = 0.25;

/** Le grand moment d'une carte à l'endroit, ou null si sa rareté n'en a pas. */
export function useMomentFor() {
  const definitions = useRarityDefinitions();
  const t = useTranslations("rarity");
  const locale = useLocale();
  return (id: string, rarity: Rarity): Moment | null => {
    if (!isBigMoment(rarity, definitions)) return null;
    const def = definitions.find((d) => d.key === rarity);
    const name = t.has(rarity) ? t(rarity) : (locale === "en" && def?.nameEn) || def?.nameFr || rarity;
    return { id, rarity, color: rarityColor(rarity, def?.appearance), seal: def?.seal ?? "", name };
  };
}

/** Fond teinté du grand moment, inondé depuis le centre (le calque lui-même vit dans RitualBackdrop). */
export function momentTint(color: string): CSSProperties {
  const tint = `color-mix(in srgb, ${color} 50%, transparent)`;
  const soft = `color-mix(in srgb, ${color} 22%, transparent)`;
  return { background: `radial-gradient(circle at 50% 45%, ${tint}, ${soft} 40%, transparent 75%)` };
}

/** Le sceau géant s'écrase au centre avec un éclair, puis s'envole vers le nom (ou dans le panneau d'aperçu avec `contained`). */
export function RevealOverlay({ moment, contained = false }: { moment: Moment; contained?: boolean }) {
  return (
    <div aria-hidden="true" className="moment-overlay" data-contained={contained || undefined} style={v({ "--moment": moment.color })}>
      <span className="moment-flash" />
      <span lang="ja" className="moment-hanko-stamp font-seal">
        {moment.seal}
      </span>
    </div>
  );
}

/** Nom de la rareté en capitales au-dessus de la carte : il s'inscrit lettre à lettre, reste 2 s, puis s'envole. */
export function RevealTitle({ moment }: { moment: Moment }) {
  const letters = Array.from(moment.name.toLocaleUpperCase());
  const out = titleOut(letters.length);
  return (
    // Toujours sur une ligne : la taille suit la largeur disponible (unités cqi), pas celle de l'écran
    <p className="@container flex w-full items-center justify-center gap-2 whitespace-nowrap" style={v({ "--moment": moment.color })}>
      <span
        aria-hidden="true"
        lang="ja"
        className="moment-title-seal moment-seal font-seal text-[clamp(1.125rem,8.5cqi,2.5rem)] leading-none"
        style={v({ "--d": `${SEAL_IN}s`, "--o": `${out + letters.length * OUT_STEP}s` })}
      >
        {moment.seal}
      </span>
      <span className="moment-title font-title text-[clamp(1.125rem,10cqi,3rem)] leading-none font-extrabold tracking-[0.06em]">
        <span className="sr-only">{moment.name}</span>
        {letters.map((ch, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="moment-letter inline-block whitespace-pre"
            style={v({ "--d": `${LETTERS_IN + i * LETTER_STEP}s`, "--o": `${out + i * OUT_STEP}s` })}
          >
            {ch}
          </span>
        ))}
      </span>
    </p>
  );
}
